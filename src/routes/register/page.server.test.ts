import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import { CODE_INVALID_MESSAGE, EMAIL_FORMAT_MESSAGE } from '#lib/server/auth-errors.js';

// issue #189: /register の load / sendCode / verifyCode の単体テスト（/login と同じ契約。FR-006, FR-012, FR-026）。

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadEvent = (user: unknown) => ({ locals: { user } }) as any;

/** form actionに渡す最小限のイベント。 */
function actionEvent(fields: Record<string, string>) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return {
		request: new Request('http://localhost/register', { method: 'POST', body: form }),
		locals: { supabase }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

type Failure = { status: number; data: { step: string; message: string; email: string } };

beforeEach(() => {
	signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
	verifyOtp.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
	resolvePostLoginPath.mockResolvedValue('/plan');
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/register load', () => {
	it('FR-026: ログイン済みなら/planへリダイレクトする', async () => {
		await expect(load(loadEvent({ email: 'a@example.com' }))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
	});

	it('未ログインならGoogleログインの可否を返す', async () => {
		await expect(load(loadEvent(null))).resolves.toEqual({ googleAuthEnabled: false });
	});
});

describe('/register sendCode', () => {
	it('FR-006: メールを正規化し、user_metadata.name にローカル部を入れてコードを送る', async () => {
		const result = await actions.sendCode(actionEvent({ email: '  Taro@Example.COM ' }));

		expect(signInWithOtp).toHaveBeenCalledWith({
			email: 'taro@example.com',
			options: { shouldCreateUser: true, data: { name: 'taro' } }
		});
		expect(result).toEqual({ step: 'code', email: 'taro@example.com' });
	});

	it('FR-011: 形式の正しくないメールはコードを送らず形式エラー', async () => {
		const result = (await actions.sendCode(
			actionEvent({ email: 'not-an-email' })
		)) as unknown as Failure;

		expect(result.status).toBe(400);
		expect(result.data).toEqual({
			step: 'email',
			message: EMAIL_FORMAT_MESSAGE,
			email: 'not-an-email'
		});
		expect(signInWithOtp).not.toHaveBeenCalled();
	});
});

describe('/register verifyCode', () => {
	it('FR-005: コードを確認し、行き先の判定の結果へ303', async () => {
		resolvePostLoginPath.mockResolvedValue('/passkey');

		await expect(
			actions.verifyCode(actionEvent({ email: 'a@example.com', code: '123456' }))
		).rejects.toMatchObject({ status: 303, location: '/passkey' });

		expect(verifyOtp).toHaveBeenCalledWith({
			email: 'a@example.com',
			token: '123456',
			type: 'email'
		});
	});

	it('FR-008: 誤ったコードはコード入力の画面のまま正しくない旨を返す', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', status: 403 } });

		const result = (await actions.verifyCode(
			actionEvent({ email: 'a@example.com', code: '000000' })
		)) as unknown as Failure;

		expect(result.status).toBe(400);
		expect(result.data).toEqual({
			step: 'code',
			message: CODE_INVALID_MESSAGE,
			email: 'a@example.com'
		});
	});
});
