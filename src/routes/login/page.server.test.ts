import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { APIError } from 'better-auth';
import { LOGIN_FAILURE_MESSAGE } from '$lib/server/auth-errors';

// issue #62: /login の load / default action の単体テスト。Better Auth本体はモックする。

const { signInEmail } = vi.hoisted(() => ({ signInEmail: vi.fn() }));

vi.mock('$lib/server/auth', () => ({
	auth: { api: { signInEmail } },
	isGoogleAuthEnabled: true
}));

const { load, actions } = await import('./+page.server');

/** loadに渡す最小限のイベント。 */
function loadEvent(user: unknown, search = '') {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { locals: { user }, url: new URL(`http://localhost/login${search}`) } as any;
}

/** default actionに渡す最小限のイベント。 */
function actionEvent(fields: Record<string, string>) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { request: new Request('http://localhost/login', { method: 'POST', body: form }) } as any;
}

/** Better Authが投げるAPIErrorを模す。 */
function apiError(code: string) {
	return new APIError('UNAUTHORIZED', { code, message: code });
}

/** loadは成功時のみ値を返す（ログイン済みはredirectでthrow）ため、戻り値を絞り込む。 */
async function runLoad(event: ReturnType<typeof loadEvent>) {
	return (await load(event)) as { googleAuthEnabled: boolean; googleError: string | null };
}

/** actionはfail()時のみ値を返す（成功時はredirectでthrow）ため、戻り値を絞り込む。 */
async function runAction(event: ReturnType<typeof actionEvent>) {
	return (await actions.default(event)) as unknown as {
		status: number;
		data: { message: string; email: string };
	};
}

beforeEach(() => {
	signInEmail.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/login load', () => {
	it('ログイン済みなら/planへリダイレクトする', async () => {
		await expect(load(loadEvent({ email: 'a@example.com' }))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
	});

	it('未ログインならGoogleログインの可否を返す', async () => {
		await expect(load(loadEvent(null))).resolves.toEqual({
			googleAuthEnabled: true,
			googleError: null
		});
	});

	it('errorクエリがあれば固定の日本語メッセージを返す', async () => {
		const data = await runLoad(loadEvent(null, '?error=google'));

		expect(data.googleError).toBe('Googleログインを完了できませんでした。もう一度お試しください。');
	});

	it('errorクエリの生の値は画面向けデータに載せない', async () => {
		const data = await runLoad(loadEvent(null, '?error=<script>alert(1)</script>'));

		expect(data.googleError).toBe('Googleログインを完了できませんでした。もう一度お試しください。');
		expect(JSON.stringify(data)).not.toContain('script');
	});
});

describe('/login default action', () => {
	it('成功したら/planへリダイレクトする', async () => {
		await expect(
			actions.default(actionEvent({ email: 'a@example.com', password: 'password123' }))
		).rejects.toMatchObject({ status: 303, location: '/plan' });
	});

	it('メールを正規化してBetter Authへ渡す', async () => {
		await expect(
			actions.default(actionEvent({ email: '  A@Example.COM ', password: 'password123' }))
		).rejects.toMatchObject({ status: 303 });

		expect(signInEmail).toHaveBeenCalledWith({
			body: { email: 'a@example.com', password: 'password123' }
		});
	});

	it('フィールド未送信でも空文字として扱う', async () => {
		signInEmail.mockRejectedValue(apiError('INVALID_EMAIL_OR_PASSWORD'));

		const result = await runAction(actionEvent({}));

		expect(result.status).toBe(400);
		expect(signInEmail).toHaveBeenCalledWith({ body: { email: '', password: '' } });
	});

	it.each([
		['メール不存在', 'USER_NOT_FOUND'],
		['誤パスワード', 'INVALID_EMAIL_OR_PASSWORD'],
		['形式不備', 'VALIDATION_ERROR']
	])('%s を区別せず統一メッセージを返す', async (_label, code) => {
		signInEmail.mockRejectedValue(apiError(code));

		const result = await runAction(actionEvent({ email: 'a@example.com', password: 'wrong' }));

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ message: LOGIN_FAILURE_MESSAGE, email: 'a@example.com' });
	});

	it('APIError以外の想定外例外も統一メッセージへフォールバックする', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInEmail.mockRejectedValue(new TypeError('unexpected internal failure'));

		const result = await runAction(
			actionEvent({ email: 'a@example.com', password: 'password123' })
		);

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(LOGIN_FAILURE_MESSAGE);
		expect(JSON.stringify(result.data)).not.toContain('unexpected internal failure');
		expect(consoleError).toHaveBeenCalled();
	});

	it('失敗時にパスワードを返さず、入力されたメールは原文のまま返す', async () => {
		signInEmail.mockRejectedValue(apiError('INVALID_EMAIL_OR_PASSWORD'));

		const result = await runAction(
			actionEvent({ email: '  A@Example.COM ', password: 'secret-password' })
		);

		expect(result.data.email).toBe('  A@Example.COM ');
		expect(JSON.stringify(result.data)).not.toContain('secret-password');
	});
});
