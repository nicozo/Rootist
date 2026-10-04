import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #116: hooks.server.ts の単体テスト。Supabaseクライアント生成はモックし、ネットワークには出ない。

const { getUser, createSupabaseClient } = vi.hoisted(() => {
	const getUser = vi.fn();
	return { getUser, createSupabaseClient: vi.fn(() => ({ auth: { getUser } })) };
});

vi.mock('$lib/server/supabase', () => ({ createSupabaseClient }));

const { handle } = await import('./hooks.server');

type Cookie = { name: string; value: string };

/** handleに渡す最小限のイベント。localsは呼び出し後に検証する。 */
function hookEvent(cookies: Cookie[] = []) {
	return {
		locals: {} as Record<string, unknown>,
		cookies: { getAll: () => cookies }
	};
}

// sb- で始まらないCookie名（Supabaseのものではないので無視されるはず）
const NON_SB_COOKIE_NAME = 'session_token';

const AUTH_COOKIE = [{ name: 'sb-abc-auth-token', value: 'secret-cookie-value-123' }];

const SUPABASE_USER = {
	id: '11111111-1111-1111-1111-111111111111',
	email: 'taro@example.com',
	user_metadata: { name: 'たろう', avatar_url: 'https://e.com/a.png' }
};

async function runHandle(event: ReturnType<typeof hookEvent>, response = new Response('ok')) {
	const resolve = vi.fn().mockResolvedValue(response);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result = await handle({ event: event as any, resolve });
	return { locals: event.locals, resolve, result };
}

beforeEach(() => {
	getUser.mockResolvedValue({ data: { user: null }, error: null });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('handle', () => {
	it('ユーザーを確認できれば locals.user を規則どおりに設定する', async () => {
		getUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });

		const { locals } = await runHandle(hookEvent(AUTH_COOKIE));

		expect(locals.user).toEqual({
			id: SUPABASE_USER.id,
			email: 'taro@example.com',
			name: 'たろう',
			image: 'https://e.com/a.png'
		});
	});

	it('locals.supabase を設定する', async () => {
		const { locals } = await runHandle(hookEvent());

		expect(locals.supabase).toBe(createSupabaseClient.mock.results[0].value);
	});

	it('resolve の戻り値をそのまま返す', async () => {
		const response = new Response('page');

		const { result } = await runHandle(hookEvent(AUTH_COOKIE), response);

		expect(result).toBe(response);
	});

	it('getUser がエラーを返したら locals.user = null で resolve する', async () => {
		getUser.mockResolvedValue({ data: { user: null }, error: { code: 'session_not_found' } });

		const { locals, resolve } = await runHandle(hookEvent(AUTH_COOKIE));

		expect(locals.user).toBeNull();
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('getUser が例外を投げても throw せず locals.user = null で resolve する', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		getUser.mockRejectedValue(new TypeError('fetch failed'));

		const { locals, resolve } = await runHandle(hookEvent(AUTH_COOKIE));

		expect(locals.user).toBeNull();
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('email が無いユーザーは未ログイン扱い（locals.user = null）', async () => {
		getUser.mockResolvedValue({
			data: { user: { ...SUPABASE_USER, email: undefined } },
			error: null
		});

		const { locals } = await runHandle(hookEvent(AUTH_COOKIE));

		expect(locals.user).toBeNull();
	});
});

describe('Supabaseへの問い合わせ（I-10・I-2）', () => {
	it('sb- の Cookie が無ければ getUser を呼ばない', async () => {
		const { locals, resolve } = await runHandle(hookEvent([]));

		expect(getUser).not.toHaveBeenCalled();
		expect(locals.user).toBeNull();
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('sb- 以外の Cookie だけでも getUser を呼ばない', async () => {
		const { locals } = await runHandle(hookEvent([{ name: NON_SB_COOKIE_NAME, value: 'dummy' }]));

		expect(getUser).not.toHaveBeenCalled();
		expect(locals.user).toBeNull();
	});

	it('getUser は resolve より前に呼ばれる', async () => {
		const order: string[] = [];
		getUser.mockImplementation(async () => {
			order.push('getUser');
			return { data: { user: null }, error: null };
		});
		const event = hookEvent(AUTH_COOKIE);
		const resolve = vi.fn(async () => {
			order.push('resolve');
			return new Response('ok');
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await handle({ event: event as any, resolve });

		expect(order).toEqual(['getUser', 'resolve']);
	});

	it('getUser の例外時のログに Cookie の値やトークン文字列を含めない', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		getUser.mockRejectedValue(new Error('boom secret-cookie-value-123'));

		await runHandle(hookEvent(AUTH_COOKIE));

		expect(consoleError).toHaveBeenCalled();
		const logged = JSON.stringify(consoleError.mock.calls);
		expect(logged).not.toContain('secret-cookie-value-123');
	});
});

// supabase-jsは障害・回数制限を例外ではなく戻り値のerrorで返す（QA指摘#1）
describe('戻り値のエラーのログ', () => {
	it.each([
		['ネットワーク障害', { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }],
		['回数制限(429)', { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }],
		['5xx', { name: 'AuthApiError', code: 'unexpected_failure', status: 500 }]
	])('%s は locals.user=null のまま、種別（name/code/status）だけログに出す', async (_l, error) => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		getUser.mockResolvedValue({
			data: { user: null },
			error: { ...error, message: 'secret-cookie-value-123' }
		});

		const { locals, resolve } = await runHandle(hookEvent(AUTH_COOKIE));

		expect(locals.user).toBeNull();
		expect(resolve).toHaveBeenCalledOnce();
		expect(consoleError).toHaveBeenCalledOnce();
		const logged = JSON.stringify(consoleError.mock.calls);
		expect(logged).toContain(error.name);
		expect(logged).not.toContain('secret-cookie-value-123');
	});

	it.each([
		['AuthSessionMissingError', { name: 'AuthSessionMissingError', status: 400 }],
		['session_not_found', { name: 'AuthApiError', code: 'session_not_found', status: 403 }],
		['bad_jwt', { name: 'AuthApiError', code: 'bad_jwt', status: 401 }]
	])('想定内の未ログイン（%s）はログに出さない', async (_l, error) => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		getUser.mockResolvedValue({ data: { user: null }, error });

		const { locals } = await runHandle(hookEvent(AUTH_COOKIE));

		expect(locals.user).toBeNull();
		expect(consoleError).not.toHaveBeenCalled();
	});
});
