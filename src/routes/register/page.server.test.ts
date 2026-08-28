import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { APIError } from 'better-auth';
import { EMAIL_FORMAT_MESSAGE, DUPLICATE_EMAIL_MESSAGE } from '$lib/server/auth-errors';

// issue #62: /register の load / default action の単体テスト。Better Auth本体はモックする。

const { signUpEmail } = vi.hoisted(() => ({ signUpEmail: vi.fn() }));

vi.mock('$lib/server/auth', () => ({
	auth: { api: { signUpEmail } },
	isGoogleAuthEnabled: true
}));

const { load, actions } = await import('./+page.server');

/** loadに渡す最小限のイベント。 */
function loadEvent(user: unknown) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { locals: { user } } as any;
}

/** default actionに渡す最小限のイベント。 */
function actionEvent(fields: Record<string, string>) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return {
		request: new Request('http://localhost/register', { method: 'POST', body: form })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

/** Better Authが投げるAPIErrorを模す。 */
function apiError(code: string) {
	return new APIError('BAD_REQUEST', { code, message: code });
}

/** actionはfail()時のみ値を返す（成功時はredirectでthrow）ため、戻り値を絞り込む。 */
async function runAction(event: ReturnType<typeof actionEvent>) {
	return (await actions.default(event)) as unknown as {
		status: number;
		data: { message: string; email: string };
	};
}

beforeEach(() => {
	signUpEmail.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/register load', () => {
	it('ログイン済みなら/planへリダイレクトする', async () => {
		await expect(load(loadEvent({ email: 'a@example.com' }))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
	});

	it('未ログインならGoogleログインの可否を返す', async () => {
		await expect(load(loadEvent(null))).resolves.toEqual({ googleAuthEnabled: true });
	});
});

describe('/register default action', () => {
	it('成功したら/planへリダイレクトする', async () => {
		await expect(
			actions.default(actionEvent({ email: 'new@example.com', password: 'password123' }))
		).rejects.toMatchObject({ status: 303, location: '/plan' });
	});

	it('メールを正規化し、ローカル部から名前を導出して渡す', async () => {
		await expect(
			actions.default(actionEvent({ email: '  Taro@Example.COM ', password: 'password123' }))
		).rejects.toMatchObject({ status: 303 });

		expect(signUpEmail).toHaveBeenCalledWith({
			body: { name: 'taro', email: 'taro@example.com', password: 'password123' }
		});
	});

	it('形式不正なメールはBetter Authに到達させず日本語メッセージを返す', async () => {
		const result = await runAction(actionEvent({ email: 'not-an-email', password: 'password123' }));

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ message: EMAIL_FORMAT_MESSAGE, email: 'not-an-email' });
		expect(signUpEmail).not.toHaveBeenCalled();
	});

	it('メール重複は専用の日本語メッセージに変換する', async () => {
		signUpEmail.mockRejectedValue(apiError('USER_ALREADY_EXISTS'));

		const result = await runAction(
			actionEvent({ email: 'dup@example.com', password: 'password123' })
		);

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(DUPLICATE_EMAIL_MESSAGE);
	});

	it('未知のエラーコードは汎用メッセージにフォールバックする', async () => {
		signUpEmail.mockRejectedValue(apiError('SOME_UNMAPPED_INTERNAL_CODE'));

		const result = await runAction(
			actionEvent({ email: 'new@example.com', password: 'password123' })
		);

		expect(result.status).toBe(400);
		expect(result.data.message).toBe('登録に失敗しました。もう一度お試しください。');
		expect(JSON.stringify(result.data)).not.toContain('SOME_UNMAPPED_INTERNAL_CODE');
	});

	it('APIError以外の想定外例外も汎用メッセージへフォールバックする', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signUpEmail.mockRejectedValue(new TypeError('unexpected internal failure'));

		const result = await runAction(
			actionEvent({ email: 'new@example.com', password: 'password123' })
		);

		expect(result.status).toBe(400);
		expect(result.data.message).toBe('登録に失敗しました。もう一度お試しください。');
		expect(JSON.stringify(result.data)).not.toContain('unexpected internal failure');
		expect(consoleError).toHaveBeenCalled();
	});

	it('失敗時にパスワードを返さず、入力されたメールは原文のまま返す', async () => {
		signUpEmail.mockRejectedValue(apiError('USER_ALREADY_EXISTS'));

		const result = await runAction(
			actionEvent({ email: '  Dup@Example.COM ', password: 'secret-password' })
		);

		expect(result.data.email).toBe('  Dup@Example.COM ');
		expect(JSON.stringify(result.data)).not.toContain('secret-password');
	});

	it('フィールド未送信でも空文字として扱い形式エラーを返す', async () => {
		const result = await runAction(actionEvent({}));

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ message: EMAIL_FORMAT_MESSAGE, email: '' });
		expect(signUpEmail).not.toHaveBeenCalled();
	});
});
