import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// issue #62: hooks.server.ts の単体テスト。Better Auth本体・SvelteKit統合ハンドラはモックする。

const { getSession, svelteKitHandler } = vi.hoisted(() => ({
	getSession: vi.fn(),
	svelteKitHandler: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('better-auth/svelte-kit', () => ({ svelteKitHandler }));
vi.mock('$app/environment', () => ({ building: false }));

const { handle } = await import('./hooks.server');

/** handleに渡す最小限のイベント。localsは呼び出し後に検証する。 */
function hookEvent() {
	return {
		locals: {} as Record<string, unknown>,
		request: new Request('http://localhost/')
	};
}

const SESSION = {
	user: {
		id: 'user-1',
		email: 'a@example.com',
		name: 'たろう',
		image: 'https://example.com/a.png'
	},
	session: { id: 'session-1', expiresAt: new Date('2026-09-01T00:00:00Z') }
};

/** handleを実行し、localsの中身を返す。 */
async function runHandle(event: ReturnType<typeof hookEvent>) {
	const resolve = vi.fn();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await handle({ event: event as any, resolve });
	return { locals: event.locals, resolve };
}

beforeEach(() => {
	getSession.mockResolvedValue(null);
	svelteKitHandler.mockResolvedValue(new Response('ok'));
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('handle', () => {
	it('セッションがあればlocals.user / locals.sessionを設定する', async () => {
		getSession.mockResolvedValue(SESSION);

		const { locals } = await runHandle(hookEvent());

		expect(locals.user).toEqual({
			id: 'user-1',
			email: 'a@example.com',
			name: 'たろう',
			image: 'https://example.com/a.png'
		});
		expect(locals.session).toEqual({ id: 'session-1', expiresAt: SESSION.session.expiresAt });
	});

	it('プロフィール画像が無いユーザーはimageをnullにする', async () => {
		getSession.mockResolvedValue({ ...SESSION, user: { ...SESSION.user, image: undefined } });

		const { locals } = await runHandle(hookEvent());

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((locals.user as any).image).toBeNull();
	});

	it('セッションが無ければlocalsをnullで初期化する', async () => {
		getSession.mockResolvedValue(null);

		const { locals } = await runHandle(hookEvent());

		expect(locals.user).toBeNull();
		expect(locals.session).toBeNull();
	});

	it('リクエストのheadersを渡してセッションを検証する', async () => {
		const event = hookEvent();

		await runHandle(event);

		expect(getSession).toHaveBeenCalledWith({ headers: event.request.headers });
	});

	it('Better AuthのSvelteKitハンドラへ処理を委譲する', async () => {
		const event = hookEvent();
		const response = new Response('from better-auth');
		svelteKitHandler.mockResolvedValue(response);
		const resolve = vi.fn();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(handle({ event: event as any, resolve })).resolves.toBe(response);
		expect(svelteKitHandler).toHaveBeenCalledWith(
			expect.objectContaining({ event, resolve, building: false })
		);
	});
});
