import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import {
	DUPLICATE_EMAIL_MESSAGE,
	EMAIL_FORMAT_MESSAGE,
	PASSWORD_LENGTH_MESSAGE,
	PASSWORD_TOO_LONG_MESSAGE,
	RATE_LIMIT_MESSAGE,
	REGISTER_FAILURE_MESSAGE
} from '#lib/server/auth-errors.js';

// issue #116: /register の load / default action の単体テスト。Supabaseクライアントはモックする。

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));

vi.mock('#lib/server/supabase.js', () => ({ isGoogleAuthEnabled: false }));

const { load, actions } = await import('./+page.server');

/** loadに渡す最小限のイベント。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadEvent = (user: unknown) => ({ locals: { user } }) as any;

/** default actionに渡す最小限のイベント。 */
function actionEvent(fields: Record<string, string>) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return {
		request: new Request('http://localhost/register', { method: 'POST', body: form }),
		locals: { supabase: { auth: { signUp } } }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

/** actionはfail()時のみ値を返す（成功時はredirectでthrow）ため、戻り値を絞り込む。 */
async function runAction(event: ReturnType<typeof actionEvent>) {
	return (await actions.default(event)) as unknown as {
		status: number;
		data: { message: string; email: string };
	};
}

const OK_SESSION = { data: { user: { id: 'u' }, session: { access_token: 't' } }, error: null };
const VALID = { email: 'taro@example.com', password: 'password123' };

beforeEach(() => {
	signUp.mockResolvedValue(OK_SESSION);
	vi.spyOn(console, 'error').mockImplementation(() => {});
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
		await expect(load(loadEvent(null))).resolves.toEqual({ googleAuthEnabled: false });
	});
});

describe('/register default action', () => {
	it('成功したら/planへ303でリダイレクトする', async () => {
		await expect(actions.default(actionEvent(VALID))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
	});

	it('メールを正規化し、user_metadata.name にローカル部を入れて渡す', async () => {
		await expect(
			actions.default(actionEvent({ email: '  Taro@Example.COM ', password: 'password123' }))
		).rejects.toMatchObject({ status: 303 });

		expect(signUp).toHaveBeenCalledWith({
			email: 'taro@example.com',
			password: 'password123',
			options: { data: { name: 'taro' } }
		});
	});

	describe('事前チェック（Supabaseに送らない）', () => {
		it('形式不正のメールは400でサインアップを呼ばない', async () => {
			const result = await runAction(
				actionEvent({ email: 'not-an-email', password: 'password123' })
			);

			expect(result.status).toBe(400);
			expect(result.data).toEqual({ message: EMAIL_FORMAT_MESSAGE, email: 'not-an-email' });
			expect(signUp).not.toHaveBeenCalled();
		});

		it('8文字未満のパスワードは400でサインアップを呼ばない', async () => {
			const result = await runAction(actionEvent({ email: VALID.email, password: 'a'.repeat(7) }));

			expect(result.status).toBe(400);
			expect(result.data.message).toBe(PASSWORD_LENGTH_MESSAGE);
			expect(signUp).not.toHaveBeenCalled();
		});

		it('72バイト超のパスワードは400でサインアップを呼ばない', async () => {
			const result = await runAction(actionEvent({ email: VALID.email, password: 'a'.repeat(73) }));

			expect(result.status).toBe(400);
			expect(result.data.message).toBe(PASSWORD_TOO_LONG_MESSAGE);
			expect(signUp).not.toHaveBeenCalled();
		});

		it('72バイトちょうどは通る', async () => {
			await expect(
				actions.default(actionEvent({ email: VALID.email, password: 'a'.repeat(72) }))
			).rejects.toMatchObject({ status: 303 });
		});
	});

	describe('Supabaseのエラー変換', () => {
		it.each([
			['user_already_exists', DUPLICATE_EMAIL_MESSAGE],
			['email_exists', DUPLICATE_EMAIL_MESSAGE],
			['weak_password', PASSWORD_LENGTH_MESSAGE],
			['email_address_invalid', EMAIL_FORMAT_MESSAGE],
			['over_request_rate_limit', RATE_LIMIT_MESSAGE],
			['over_email_send_rate_limit', RATE_LIMIT_MESSAGE],
			['signup_disabled', REGISTER_FAILURE_MESSAGE],
			['some_unknown_code', REGISTER_FAILURE_MESSAGE]
		])('%s は400で該当メッセージを返す', async (code, message) => {
			signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code } });

			const result = await runAction(actionEvent(VALID));

			expect(result.status).toBe(400);
			expect(result.data.message).toBe(message);
		});

		it('codeが無いエラーも汎用メッセージにする', async () => {
			signUp.mockResolvedValue({ data: { user: null, session: null }, error: {} });

			const result = await runAction(actionEvent(VALID));

			expect(result.status).toBe(400);
			expect(result.data.message).toBe(REGISTER_FAILURE_MESSAGE);
		});
	});

	it('エラーが無くてもセッションが無ければ（Confirm email ON）400で/planへ送らず、ログに残す', async () => {
		signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null });

		const result = await runAction(actionEvent(VALID));

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(REGISTER_FAILURE_MESSAGE);
		expect(console.error).toHaveBeenCalled();
	});

	it('想定外の例外も500にせず400の汎用メッセージにする（内部メッセージは返さない）', async () => {
		signUp.mockRejectedValue(new TypeError('unexpected internal failure'));

		const result = await runAction(actionEvent(VALID));

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(REGISTER_FAILURE_MESSAGE);
		expect(JSON.stringify(result.data)).not.toContain('unexpected internal failure');
		expect(console.error).toHaveBeenCalled();
	});

	it('失敗時にパスワードを返さず、入力されたメールは原文のまま返す', async () => {
		signUp.mockResolvedValue({
			data: { user: null, session: null },
			error: { code: 'user_already_exists' }
		});

		const result = await runAction(
			actionEvent({ email: '  Taro@Example.COM ', password: 'secret-password' })
		);

		expect(result.data.email).toBe('  Taro@Example.COM ');
		expect(JSON.stringify(result.data)).not.toContain('secret-password');
	});

	it('フィールド未送信でも空文字として扱い、形式エラーにする', async () => {
		const result = await runAction(actionEvent({}));

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(EMAIL_FORMAT_MESSAGE);
		expect(signUp).not.toHaveBeenCalled();
	});
});

describe('/register 戻り値のエラーのログ（QA指摘#1）', () => {
	it('ネットワーク障害（AuthRetryableFetchError を戻り値で返す）は汎用メッセージ＋種別のみログ', async () => {
		signUp.mockResolvedValue({
			data: { user: null, session: null },
			error: { name: 'AuthRetryableFetchError', message: 'secret-password', status: 0 }
		});

		const result = await runAction(actionEvent({ ...VALID, password: 'secret-password' }));

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(REGISTER_FAILURE_MESSAGE);
		expect(console.error).toHaveBeenCalledOnce();
		const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
		expect(logged).toContain('AuthRetryableFetchError');
		expect(logged).not.toContain('secret-password');
	});

	it('回数制限(429)は回数制限メッセージ＋ログ', async () => {
		signUp.mockResolvedValue({
			data: { user: null, session: null },
			error: { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }
		});

		const result = await runAction(actionEvent(VALID));

		expect(result.data.message).toBe(RATE_LIMIT_MESSAGE);
		expect(console.error).toHaveBeenCalledOnce();
	});

	it('重複などの通常の失敗はログに出さない', async () => {
		signUp.mockResolvedValue({
			data: { user: null, session: null },
			error: { name: 'AuthApiError', code: 'user_already_exists', status: 422 }
		});

		await runAction(actionEvent(VALID));

		expect(console.error).not.toHaveBeenCalled();
	});
});
