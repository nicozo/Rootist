import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import { LOGIN_FAILURE_MESSAGE, RATE_LIMIT_MESSAGE } from '#lib/server/auth-errors.js';

// issue #116: /login の load / default action の単体テスト。Supabaseクライアントはモックする。

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));

vi.mock('#lib/server/supabase.js', () => ({ isGoogleAuthEnabled: false }));

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
	return {
		request: new Request('http://localhost/login', { method: 'POST', body: form }),
		locals: { supabase: { auth: { signInWithPassword } } }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
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
	signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
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
			googleAuthEnabled: false,
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
	it('成功したら/planへ303でリダイレクトする', async () => {
		await expect(
			actions.default(actionEvent({ email: 'a@example.com', password: 'password123' }))
		).rejects.toMatchObject({ status: 303, location: '/plan' });
	});

	it('メールを正規化してSupabaseへ渡す', async () => {
		await expect(
			actions.default(actionEvent({ email: '  A@Example.COM ', password: 'password123' }))
		).rejects.toMatchObject({ status: 303 });

		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'a@example.com',
			password: 'password123'
		});
	});

	it('フィールド未送信でも空文字として扱い、事前チェックで早期returnせずSupabaseへ送る', async () => {
		signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'validation_failed' } });

		const result = await runAction(actionEvent({}));

		expect(result.status).toBe(400);
		expect(signInWithPassword).toHaveBeenCalledWith({ email: '', password: '' });
	});

	it.each([
		['誤パスワード', { code: 'invalid_credentials' }],
		['メール未確認', { code: 'email_not_confirmed' }],
		['メール不存在', { code: 'user_not_found' }],
		['形式不備', { code: 'validation_failed' }],
		['未知のコード', { code: 'something_new' }],
		['コード無し', {}]
	])('%s を区別せず同じステータス・統一メッセージを返す', async (_label, error) => {
		signInWithPassword.mockResolvedValue({ data: {}, error });

		const result = await runAction(actionEvent({ email: 'a@example.com', password: 'wrong' }));

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ message: LOGIN_FAILURE_MESSAGE, email: 'a@example.com' });
	});

	it.each(['over_request_rate_limit', 'over_email_send_rate_limit'])(
		'回数制限(%s)だけ別メッセージを返す',
		async (code) => {
			signInWithPassword.mockResolvedValue({ data: {}, error: { code } });

			const result = await runAction(actionEvent({ email: 'a@example.com', password: 'x' }));

			expect(result.status).toBe(400);
			expect(result.data.message).toBe(RATE_LIMIT_MESSAGE);
		}
	);

	it('想定外の例外も統一メッセージへフォールバックする', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithPassword.mockRejectedValue(new TypeError('unexpected internal failure'));

		const result = await runAction(
			actionEvent({ email: 'a@example.com', password: 'password123' })
		);

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(LOGIN_FAILURE_MESSAGE);
		expect(JSON.stringify(result.data)).not.toContain('unexpected internal failure');
		expect(consoleError).toHaveBeenCalled();
	});

	it('失敗時にパスワードを返さず、入力されたメールは原文のまま返す', async () => {
		signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } });

		const result = await runAction(
			actionEvent({ email: '  A@Example.COM ', password: 'secret-password' })
		);

		expect(result.data.email).toBe('  A@Example.COM ');
		expect(JSON.stringify(result.data)).not.toContain('secret-password');
	});
});

describe('/login 戻り値のエラーのログ（QA指摘#1）', () => {
	it('ネットワーク障害（AuthRetryableFetchError を戻り値で返す）は統一メッセージ＋種別のみログ', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithPassword.mockResolvedValue({
			data: {},
			error: { name: 'AuthRetryableFetchError', message: 'secret-password', status: 0 }
		});

		const result = await runAction(
			actionEvent({ email: 'a@example.com', password: 'secret-password' })
		);

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(LOGIN_FAILURE_MESSAGE);
		expect(consoleError).toHaveBeenCalledOnce();
		const logged = JSON.stringify(consoleError.mock.calls);
		expect(logged).toContain('AuthRetryableFetchError');
		expect(logged).not.toContain('secret-password');
	});

	it('回数制限(429)は回数制限メッセージ＋ログ', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithPassword.mockResolvedValue({
			data: {},
			error: { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }
		});

		const result = await runAction(actionEvent({ email: 'a@example.com', password: 'x' }));

		expect(result.data.message).toBe(RATE_LIMIT_MESSAGE);
		expect(consoleError).toHaveBeenCalledOnce();
	});

	it('誤パスワード等の通常の失敗はログに出さない', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithPassword.mockResolvedValue({
			data: {},
			error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 }
		});

		await runAction(actionEvent({ email: 'a@example.com', password: 'x' }));

		expect(consoleError).not.toHaveBeenCalled();
	});
});
