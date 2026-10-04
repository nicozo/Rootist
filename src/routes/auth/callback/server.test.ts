import { describe, expect, it, vi, afterEach, beforeEach } from 'vite-plus/test';
import { GET } from './+server';

// issue #117: GET /auth/callback（Google認証からの戻り）の単体テスト。

const exchangeCodeForSession = vi.fn();

function event(search: string) {
	return {
		url: new URL(`http://localhost/auth/callback${search}`),
		locals: { supabase: { auth: { exchangeCodeForSession } } }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

beforeEach(() => {
	exchangeCodeForSession.mockResolvedValue({ error: null });
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
});
