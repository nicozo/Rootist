import { describe, expect, it, vi, afterEach, beforeEach } from 'vite-plus/test';

// issue #117: GET /auth/callback（Google認証からの戻り）の単体テスト。
// issue #199: 成功時は案内を挟まず常に /plan へ（FR-003, FR-004, FR-014）。

const { GET } = await import('./+server');

const exchangeCodeForSession = vi.fn();
const passkeyList = vi.fn();
const supabase = { auth: { exchangeCodeForSession, passkey: { list: passkeyList } } };

function event(search: string) {
	return {
		url: new URL(`http://localhost/auth/callback${search}`),
		locals: { supabase }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

beforeEach(() => {
	exchangeCodeForSession.mockResolvedValue({ error: null });
	passkeyList.mockResolvedValue({ data: [], error: null });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/auth/callback', () => {
	it('FR-003, FR-004: 認可コードを交換できたら/planへ', async () => {
		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
		expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
	});

	it('FR-014: 交換できてもパスキーの有無を調べず案内を挟まない', async () => {
		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
		expect(passkeyList).not.toHaveBeenCalled();
	});

	it('FR-007: codeが無ければ/login?error=googleへ（交換しない）', async () => {
		await expect(GET(event(''))).rejects.toMatchObject({
			status: 303,
			location: '/login?error=google'
		});
		expect(exchangeCodeForSession).not.toHaveBeenCalled();
	});

	it('FR-007: キャンセル（errorパラメータ）なら/login?error=googleへ', async () => {
		await expect(GET(event('?error=access_denied&error_code=x'))).rejects.toMatchObject({
			location: '/login?error=google'
		});
		expect(exchangeCodeForSession).not.toHaveBeenCalled();
	});

	it('FR-007: 交換に失敗したら/login?error=googleへ', async () => {
		exchangeCodeForSession.mockResolvedValue({ error: { code: 'bad_code' } });
		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			location: '/login?error=google'
		});
	});

	it('FR-007: 例外が出ても500にせず/login?error=googleへ', async () => {
		exchangeCodeForSession.mockRejectedValue(new Error('network'));
		await expect(GET(event('?code=abc'))).rejects.toMatchObject({
			location: '/login?error=google'
		});
	});
});
