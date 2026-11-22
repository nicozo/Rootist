import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import {
	CODE_INVALID_MESSAGE,
	EMAIL_FORMAT_MESSAGE,
	RATE_LIMIT_MESSAGE,
	RESEND_WAIT_MESSAGE,
	SEND_FAILURE_MESSAGE
} from '#lib/server/auth-errors.js';

// issue #189: /login の load / sendCode / verifyCode の単体テスト。Supabase クライアントはモックする。

const { signInWithOtp, verifyOtp, resolvePostLoginPath } = vi.hoisted(() => ({
	signInWithOtp: vi.fn(),
	verifyOtp: vi.fn(),
	resolvePostLoginPath: vi.fn()
}));

vi.mock('#lib/server/supabase.js', () => ({ isGoogleAuthEnabled: false }));
vi.mock('#lib/server/post-login.js', () => ({ resolvePostLoginPath }));

const { load, actions } = await import('./+page.server');

const supabase = { auth: { signInWithOtp, verifyOtp } };

/** loadに渡す最小限のイベント。 */
function loadEvent(user: unknown, search = '') {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { locals: { user }, url: new URL(`http://localhost/login${search}`) } as any;
}

/** form actionに渡す最小限のイベント。 */
function actionEvent(fields: Record<string, string>) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return {
		request: new Request('http://localhost/login', { method: 'POST', body: form }),
		locals: { supabase }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

type Failure = { status: number; data: { step: string; message: string; email: string } };
type CodeStep = { step: 'code'; email: string };

beforeEach(() => {
	signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
	verifyOtp.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
	resolvePostLoginPath.mockResolvedValue('/plan');
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/login load', () => {
	it('FR-026: ログイン済みなら/planへリダイレクトする', async () => {
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

	it('FR-021: errorクエリがあれば固定の日本語メッセージを返す', async () => {
		const data = (await load(loadEvent(null, '?error=google'))) as { googleError: string | null };

		expect(data.googleError).toBe('Googleログインを完了できませんでした。もう一度お試しください。');
	});

	it('errorクエリの生の値は画面向けデータに載せない', async () => {
		const data = await load(loadEvent(null, '?error=<script>alert(1)</script>'));

		expect(JSON.stringify(data)).not.toContain('script');
	});
});

describe('/login sendCode', () => {
	it('FR-003, FR-004, FR-006: メールを正規化し、作成時の表示名を添えてコードを送り、コード入力の画面へ進む', async () => {
		const result = await actions.sendCode(actionEvent({ email: '  Taro@Example.COM ' }));

		expect(signInWithOtp).toHaveBeenCalledWith({
			email: 'taro@example.com',
			options: { shouldCreateUser: true, data: { name: 'taro' } }
		});
		expect(result).toEqual({ step: 'code', email: 'taro@example.com' } satisfies CodeStep);
	});

	it('FR-024: 登録の有無で応答を変えない', async () => {
		signInWithOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });
		const first = await actions.sendCode(actionEvent({ email: 'new@example.com' }));
		signInWithOtp.mockResolvedValueOnce({
			data: { user: { id: 'existing' }, session: null },
			error: null
		});
		const second = await actions.sendCode(actionEvent({ email: 'new@example.com' }));

		expect(second).toEqual(first);
	});

	it.each(['not-an-email', '', 'a@b'])(
		'FR-011: 形式の正しくないメール(%j)はコードを送らず形式エラー',
		async (email) => {
			const result = (await actions.sendCode(actionEvent({ email }))) as unknown as Failure;

			expect(result.status).toBe(400);
			expect(result.data).toEqual({ step: 'email', message: EMAIL_FORMAT_MESSAGE, email });
			expect(signInWithOtp).not.toHaveBeenCalled();
		}
	);

	it('フィールド未送信は空文字として扱い、形式エラーにする', async () => {
		const result = (await actions.sendCode(actionEvent({}))) as unknown as Failure;

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(EMAIL_FORMAT_MESSAGE);
	});

	it.each([
		['FR-009', 'over_email_send_rate_limit', RESEND_WAIT_MESSAGE],
		['FR-023', 'over_request_rate_limit', RATE_LIMIT_MESSAGE],
		['FR-025', 'unexpected_failure', SEND_FAILURE_MESSAGE]
	])('%s: %s は固定のメッセージでメール入力の画面のまま', async (_fr, code, message) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithOtp.mockResolvedValue({ data: {}, error: { code, status: 429 } });

		const result = (await actions.sendCode(
			actionEvent({ email: ' A@Example.com ' })
		)) as unknown as Failure;

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ step: 'email', message, email: ' A@Example.com ' });
	});

	it('FR-025: 想定外の例外も500にせず送信失敗のメッセージにする（内部メッセージは返さない）', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithOtp.mockRejectedValue(new TypeError('internal secret detail'));

		const result = (await actions.sendCode(
			actionEvent({ email: 'a@example.com' })
		)) as unknown as Failure;

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(SEND_FAILURE_MESSAGE);
		expect(JSON.stringify(result.data)).not.toContain('internal secret detail');
		expect(consoleError).toHaveBeenCalled();
	});

	it('回数制限・ネットワーク障害は種別だけをログに残す', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithOtp.mockResolvedValue({
			data: {},
			error: {
				name: 'AuthApiError',
				code: 'over_request_rate_limit',
				status: 429,
				message: 'a@example.com is limited'
			}
		});

		await actions.sendCode(actionEvent({ email: 'a@example.com' }));

		expect(consoleError).toHaveBeenCalledOnce();
		const logged = JSON.stringify(consoleError.mock.calls);
		expect(logged).toContain('over_request_rate_limit');
		expect(logged).not.toContain('a@example.com');
	});
});

describe('/login sendCode の再送（コード入力の画面から。resend=1）', () => {
	it('FR-009: 再送の間隔に当たったらコード入力の画面のまま待つ旨を返す', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		signInWithOtp.mockResolvedValue({
			data: {},
			error: { code: 'over_email_send_rate_limit', status: 429 }
		});

		const result = (await actions.sendCode(
			actionEvent({ email: 'a@example.com', resend: '1' })
		)) as unknown as Failure;

		expect(result.status).toBe(400);
		expect(result.data).toEqual({
			step: 'code',
			message: RESEND_WAIT_MESSAGE,
			email: 'a@example.com'
		});
	});

	it('FR-010: 再送に成功したらコード入力の画面のまま新しいコードを送る', async () => {
		const result = await actions.sendCode(actionEvent({ email: 'a@example.com', resend: '1' }));

		expect(signInWithOtp).toHaveBeenCalledOnce();
		expect(result).toEqual({ step: 'code', email: 'a@example.com' });
	});
});

describe('/login verifyCode', () => {
	it('FR-005, FR-007: コードを確認し、行き先の判定が/planなら/planへ303', async () => {
		resolvePostLoginPath.mockResolvedValue('/plan');

		await expect(
			actions.verifyCode(actionEvent({ email: 'a@example.com', code: '123456' }))
		).rejects.toMatchObject({ status: 303, location: '/plan' });

		expect(verifyOtp).toHaveBeenCalledWith({
			email: 'a@example.com',
			token: '123456',
			type: 'email'
		});
		expect(resolvePostLoginPath).toHaveBeenCalledWith(supabase);
	});

	it('FR-013: 行き先の判定が/passkeyなら/passkeyへ303', async () => {
		resolvePostLoginPath.mockResolvedValue('/passkey');

		await expect(
			actions.verifyCode(actionEvent({ email: 'a@example.com', code: '123456' }))
		).rejects.toMatchObject({ status: 303, location: '/passkey' });
	});

	it('メールを正規化し、コード前後の空白を取り除いて渡す', async () => {
		await expect(
			actions.verifyCode(actionEvent({ email: ' A@Example.COM ', code: ' 123456 ' }))
		).rejects.toMatchObject({ status: 303 });

		expect(verifyOtp).toHaveBeenCalledWith({
			email: 'a@example.com',
			token: '123456',
			type: 'email'
		});
	});

	it.each(['otp_expired', 'validation_failed', 'something_new'])(
		'FR-008, FR-022: エラー(%s)ならコード入力の画面のままコードが正しくない旨を返す',
		async (code) => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			verifyOtp.mockResolvedValue({ data: {}, error: { code, status: 403 } });

			const result = (await actions.verifyCode(
				actionEvent({ email: 'a@example.com', code: '000000' })
			)) as unknown as Failure;

			expect(result.status).toBe(400);
			expect(result.data).toEqual({
				step: 'code',
				message: CODE_INVALID_MESSAGE,
				email: 'a@example.com'
			});
			expect(resolvePostLoginPath).not.toHaveBeenCalled();
		}
	);

	it('FR-023: 回数制限ならしばらく待つ旨を返す', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		verifyOtp.mockResolvedValue({
			data: {},
			error: { code: 'over_request_rate_limit', status: 429 }
		});

		const result = (await actions.verifyCode(
			actionEvent({ email: 'a@example.com', code: '000000' })
		)) as unknown as Failure;

		expect(result.data.step).toBe('code');
		expect(result.data.message).toBe(RATE_LIMIT_MESSAGE);
	});

	it.each(['12345', '1234567', 'abcdef', ''])(
		'FR-008: 6桁の数字でないコード(%j)はSupabaseに送らず正しくない旨を返す',
		async (code) => {
			const result = (await actions.verifyCode(
				actionEvent({ email: 'a@example.com', code })
			)) as unknown as Failure;

			expect(result.status).toBe(400);
			expect(result.data.message).toBe(CODE_INVALID_MESSAGE);
			expect(verifyOtp).not.toHaveBeenCalled();
		}
	);

	it('想定外の例外も500にせずコードが正しくない旨を返す', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		verifyOtp.mockRejectedValue(new TypeError('internal secret detail'));

		const result = (await actions.verifyCode(
			actionEvent({ email: 'a@example.com', code: '123456' })
		)) as unknown as Failure;

		expect(result.status).toBe(400);
		expect(JSON.stringify(result.data)).not.toContain('internal secret detail');
		expect(consoleError).toHaveBeenCalled();
	});

	it('ログインの失敗にコードを載せない', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', status: 403 } });

		const result = (await actions.verifyCode(
			actionEvent({ email: 'a@example.com', code: '654321' })
		)) as unknown as Failure;

		expect(JSON.stringify(result.data)).not.toContain('654321');
	});
});
