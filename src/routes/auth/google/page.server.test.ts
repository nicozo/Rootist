import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { APIError } from 'better-auth';

// issue #62: Googleログイン開始ルートの単体テスト。
// 実際のGoogle OAuthエンドポイントへは一切アクセスせず、Better Authをモックする。

const { signInSocial } = vi.hoisted(() => ({ signInSocial: vi.fn() }));

vi.mock('$lib/server/auth', () => ({ auth: { api: { signInSocial } } }));

const { load, actions } = await import('./+page.server');

const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test';

/** default actionに渡す最小限のイベント。 */
function actionEvent() {
	return {
		request: new Request('http://localhost/auth/google', { method: 'POST' })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

beforeEach(() => {
	signInSocial.mockResolvedValue({ url: AUTHORIZATION_URL });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/auth/google load', () => {
	it('GETアクセスは/loginへリダイレクトする（開始はPOST専用）', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load({} as any)).rejects.toMatchObject({ status: 303, location: '/login' });
		expect(signInSocial).not.toHaveBeenCalled();
	});
});

describe('/auth/google default action', () => {
	it('Googleの認可URLへリダイレクトする', async () => {
		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: AUTHORIZATION_URL
		});
	});

	it('コールバック先を指定してsignInSocialを呼ぶ', async () => {
		await expect(actions.default(actionEvent())).rejects.toMatchObject({ status: 303 });

		expect(signInSocial).toHaveBeenCalledWith(
			expect.objectContaining({
				body: { provider: 'google', callbackURL: '/plan', errorCallbackURL: '/login' }
			})
		);
	});

	it('プロバイダ未登録（環境変数未設定）なら500を出さず/login?error=googleへ退避する', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInSocial.mockRejectedValue(
			new APIError('NOT_FOUND', { code: 'PROVIDER_NOT_FOUND', message: 'provider not found' })
		);

		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/login?error=google'
		});
		expect(consoleError).toHaveBeenCalled();
	});

	it('codeを持たないAPIErrorでもmessageをログに残して退避する', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInSocial.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'boom' }));

		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/login?error=google'
		});
		expect(consoleError).toHaveBeenCalled();
	});

	it('認可URLが返らない場合も500を出さず/login?error=googleへ退避する', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInSocial.mockResolvedValue({});

		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/login?error=google'
		});
		expect(consoleError).toHaveBeenCalled();
	});

	it('APIError以外の想定外例外はそのまま伝播させる', async () => {
		signInSocial.mockRejectedValue(new TypeError('unexpected internal failure'));

		await expect(actions.default(actionEvent())).rejects.toThrow('unexpected internal failure');
	});
});
