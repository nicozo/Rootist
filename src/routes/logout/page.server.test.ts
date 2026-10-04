import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #116: /logout の load / default action の単体テスト。Supabaseクライアントはモックする。

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

const { load, actions } = await import('./+page.server');

const COOKIES = [
	{ name: 'sb-abc-auth-token.0', value: 'x' },
	{ name: 'sb-abc-auth-token.1', value: 'y' },
	{ name: 'sb-abc-auth-token-code-verifier', value: 'z' },
	{ name: 'theme', value: 'dark' },
	{ name: 'better-' + 'auth.session_token', value: 'old' }
];

/** default actionに渡す最小限のイベント。 */
function actionEvent() {
	const cookies = { getAll: vi.fn(() => COOKIES), delete: vi.fn() };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const event = { locals: { supabase: { auth: { signOut } } }, cookies } as any;
	return { event, cookies };
}

function expectOnlySbCookiesDeleted(cookies: { delete: ReturnType<typeof vi.fn> }) {
	expect(cookies.delete.mock.calls).toEqual([
		['sb-abc-auth-token.0', { path: '/' }],
		['sb-abc-auth-token.1', { path: '/' }],
		['sb-abc-auth-token-code-verifier', { path: '/' }]
	]);
}

beforeEach(() => {
	signOut.mockResolvedValue({ error: null });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/logout load', () => {
	it('GETアクセスは/へリダイレクトする（ログアウトはPOST専用）', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load({} as any)).rejects.toMatchObject({ status: 303, location: '/' });
		expect(signOut).not.toHaveBeenCalled();
	});
});

describe('/logout default action', () => {
	it('この端末のセッションのみ無効化し、sb- の Cookie だけを削除して/へ303', async () => {
		const { event, cookies } = actionEvent();

		await expect(actions.default(event)).rejects.toMatchObject({ status: 303, location: '/' });

		expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
		expectOnlySbCookiesDeleted(cookies);
	});

	it('signOut がエラーを返しても/へ303し、sb- の Cookie を削除する', async () => {
		signOut.mockResolvedValue({ error: { code: 'session_not_found' } });
		const { event, cookies } = actionEvent();

		await expect(actions.default(event)).rejects.toMatchObject({ status: 303, location: '/' });

		expectOnlySbCookiesDeleted(cookies);
	});

	it('signOut が例外を投げても500にせず/へ303し、sb- の Cookie を削除する', async () => {
		signOut.mockRejectedValue(new TypeError('fetch failed'));
		const { event, cookies } = actionEvent();

		await expect(actions.default(event)).rejects.toMatchObject({ status: 303, location: '/' });

		expectOnlySbCookiesDeleted(cookies);
	});
});
