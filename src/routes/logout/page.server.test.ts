import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { APIError } from 'better-auth';

// issue #62: /logout の load / default action の単体テスト。Better Auth本体はモックする。

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('$lib/server/auth', () => ({ auth: { api: { signOut } } }));

const { load, actions } = await import('./+page.server');

/** default actionに渡す最小限のイベント。 */
function actionEvent(headers: Record<string, string> = {}) {
	return {
		request: new Request('http://localhost/logout', { method: 'POST', headers })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

beforeEach(() => {
	signOut.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('/logout load', () => {
	it('GETアクセスは/へリダイレクトする（ログアウトはPOST専用）', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(load({} as any)).rejects.toMatchObject({ status: 303, location: '/' });
		expect(signOut).not.toHaveBeenCalled();
	});
});

describe('/logout default action', () => {
	it('サインアウト後に/へリダイレクトする', async () => {
		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
		expect(signOut).toHaveBeenCalledOnce();
	});

	it('セッション特定のためCookieを含むheadersをBetter Authへ渡す', async () => {
		await expect(
			actions.default(actionEvent({ cookie: 'better-auth.session_token=abc' }))
		).rejects.toMatchObject({ status: 303 });

		const passedHeaders = signOut.mock.calls[0][0].headers as Headers;
		expect(passedHeaders.get('cookie')).toBe('better-auth.session_token=abc');
	});

	it('未ログイン状態でもエラーにせず/へリダイレクトする', async () => {
		signOut.mockRejectedValue(new APIError('UNAUTHORIZED', { code: 'FAILED_TO_GET_SESSION' }));

		await expect(actions.default(actionEvent())).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
	});

	it('APIError以外の想定外例外はそのまま伝播させる', async () => {
		signOut.mockRejectedValue(new TypeError('unexpected internal failure'));

		await expect(actions.default(actionEvent())).rejects.toThrow('unexpected internal failure');
	});
});
