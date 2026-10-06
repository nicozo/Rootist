import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #117: POST /auth/google（Googleログイン開始）の単体テスト。Supabaseクライアントはモックする。

const { signInWithOAuth, flag } = vi.hoisted(() => ({
	signInWithOAuth: vi.fn(),
	flag: { enabled: true }
}));

vi.mock('#lib/server/supabase.js', () => ({
	get isGoogleAuthEnabled() {
		return flag.enabled;
	}
}));

const { load, actions } = await import('./+page.server');

function actionEvent() {
	return {
		url: new URL('http://localhost:20117/auth/google'),
		locals: { supabase: { auth: { signInWithOAuth } } }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

beforeEach(() => {
	flag.enabled = true;
	signInWithOAuth.mockResolvedValue({
		data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' },
		error: null
	});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/auth/google', () => {
	it('GETは/loginへリダイレクトする', async () => {
		await expect(load({} as never)).rejects.toMatchObject({ status: 303, location: '/login' });
	});

	it('Supabaseの認可URLへリダイレクトし、戻り先に/auth/callbackを渡す', async () => {
		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: 'https://example.supabase.co/auth/v1/authorize?provider=google'
		});
		expect(signInWithOAuth).toHaveBeenCalledWith({
			provider: 'google',
			options: { redirectTo: 'http://localhost:20117/auth/callback', skipBrowserRedirect: true }
		});
	});

	it('無効な環境では404を返しSupabaseを呼ばない', async () => {
		flag.enabled = false;
		await expect(actions.default(actionEvent())).rejects.toMatchObject({ status: 404 });
		expect(signInWithOAuth).not.toHaveBeenCalled();
	});

	it('Supabaseがエラーを返したら/login?error=googleへ戻す', async () => {
		signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { code: 'x' } });
		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/login?error=google'
		});
	});

	it('例外が出ても500にせず/login?error=googleへ戻す', async () => {
		signInWithOAuth.mockRejectedValue(new Error('network'));
		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/login?error=google'
		});
	});
});
