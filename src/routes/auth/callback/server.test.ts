import { describe, expect, it, vi, afterEach, beforeEach } from 'vite-plus/test';

// issue #117: GET /auth/callback（Google認証からの戻り）の単体テスト。
// issue #189: 成功時の行き先は resolvePostLoginPath で決める（モックする）。

const { resolvePostLoginPath } = vi.hoisted(() => ({ resolvePostLoginPath: vi.fn() }));
vi.mock('#lib/server/post-login.js', () => ({ resolvePostLoginPath }));

const { GET } = await import('./+server');

const exchangeCodeForSession = vi.fn();
const supabase = { auth: { exchangeCodeForSession } };

function event(search: string) {
	return {
		url: new URL(`http://localhost/auth/callback${search}`),
		locals: { supabase }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

beforeEach(() => {
	exchangeCodeForSession.mockResolvedValue({ error: null });
	resolvePostLoginPath.mockResolvedValue('/plan');
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/auth/callback', () => {
	it('認可コードを交換できたら/planへ', async () => {
		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
		expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
	});

	it('codeが無ければ/login?error=googleへ（交換しない）', async () => {
		await expect(GET(event(''))).rejects.toMatchObject({
			status: 303,
			location: '/login?error=google'
		});
		expect(exchangeCodeForSession).not.toHaveBeenCalled();
	});

	it('キャンセル（errorパラメータ）なら/login?error=googleへ', async () => {
		await expect(GET(event('?error=access_denied&error_code=x'))).rejects.toMatchObject({
			location: '/login?error=google'
		});
		expect(exchangeCodeForSession).not.toHaveBeenCalled();
	});

	it('交換に失敗したら/login?error=googleへ', async () => {
		exchangeCodeForSession.mockResolvedValue({ error: { code: 'bad_code' } });
		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			location: '/login?error=google'
		});
	});

	it('例外が出ても500にせず/login?error=googleへ', async () => {
		exchangeCodeForSession.mockRejectedValue(new Error('network'));
		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			location: '/login?error=google'
		});
	});

	it('FR-020, FR-013: 交換できたら行き先の判定の結果（/passkey）へ', async () => {
		resolvePostLoginPath.mockResolvedValue('/passkey');

		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			status: 303,
			location: '/passkey'
		});
		expect(resolvePostLoginPath).toHaveBeenCalledWith(supabase);
	});

	it('FR-021: 交換に失敗したら行き先の判定を呼ばない', async () => {
		exchangeCodeForSession.mockResolvedValue({ error: { code: 'bad_code' } });

		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			location: '/login?error=google'
		});
		expect(resolvePostLoginPath).not.toHaveBeenCalled();
	});
});
