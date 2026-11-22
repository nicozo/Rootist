import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #189: パスキーの remote function（startPasskeyRegistration / verifyPasskeyRegistration /
// startPasskeyLogin / verifyPasskeyLogin）の単体テスト。Supabase クライアントはモックする。
// 本物の remote module を、スキーマ検証 → 本体の経路で呼ぶ（#lib/server/test-utils/remote-call.ts）。

const state = vi.hoisted(() => ({
	locals: {} as { user: unknown; supabase: unknown }
}));

vi.mock('$app/server', async () => ({
	...(await import('#lib/server/test-utils/remote-call.js')).createAppServerModule(),
	getRequestEvent: () => ({ locals: state.locals })
}));

const passkey = {
	startRegistration: vi.fn(),
	verifyRegistration: vi.fn(),
	startAuthentication: vi.fn(),
	verifyAuthentication: vi.fn()
};

const remote = await import('#lib/remote/passkey.remote.js');
const { callRemote, assertSchemaRegistered } =
	await import('#lib/server/test-utils/remote-call.js');

const USER = { id: 'u1', email: 'a@example.com', name: 'a', image: null };
const CREDENTIAL = { id: 'cred-1', type: 'public-key', response: { clientDataJSON: 'x' } };

function signInAs(user: unknown) {
	state.locals = { user, supabase: { auth: { passkey } } };
}

beforeEach(() => {
	signInAs(USER);
	passkey.startRegistration.mockResolvedValue({
		data: { challenge_id: 'ch-reg', options: { challenge: 'abc' }, expires_at: 1 },
		error: null
	});
	passkey.verifyRegistration.mockResolvedValue({
		data: { id: 'pk-1', created_at: '2026-11-22T00:00:00Z' },
		error: null
	});
	passkey.startAuthentication.mockResolvedValue({
		data: { challenge_id: 'ch-auth', options: { challenge: 'def' }, expires_at: 1 },
		error: null
	});
	passkey.verifyAuthentication.mockResolvedValue({
		data: { session: { access_token: 't' }, user: { id: 'u1' } },
		error: null
	});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('startPasskeyRegistration（FR-014）', () => {
	it('未ログインは 401 で、Supabase を呼ばない', async () => {
		signInAs(null);

		await expect(callRemote(remote.startPasskeyRegistration)).rejects.toMatchObject({
			status: 401
		});
		expect(passkey.startRegistration).not.toHaveBeenCalled();
	});

	it('challengeId と作成オプションを返す', async () => {
		await expect(callRemote(remote.startPasskeyRegistration)).resolves.toEqual({
			challengeId: 'ch-reg',
			options: { challenge: 'abc' }
		});
	});

	it('Supabase のエラーは 400（内部のメッセージは返さない）', async () => {
		passkey.startRegistration.mockResolvedValue({
			data: null,
			error: { name: 'AuthApiError', code: 'x', status: 500, message: 'secret detail' }
		});

		const thrown = (await callRemote(remote.startPasskeyRegistration).catch((e: unknown) => e)) as {
			status: number;
			body: unknown;
		};

		expect(thrown).toMatchObject({ status: 400 });
		expect(JSON.stringify(thrown.body)).not.toContain('secret detail');
	});
});

describe('verifyPasskeyRegistration（FR-014, FR-016）', () => {
	it('スキーマを登録している', () => {
		expect(() => assertSchemaRegistered(remote.verifyPasskeyRegistration)).not.toThrow();
	});

	it('未ログインは 401 で、Supabase を呼ばない', async () => {
		signInAs(null);

		await expect(
			callRemote(remote.verifyPasskeyRegistration, {
				challengeId: 'ch-reg',
				credential: CREDENTIAL
			})
		).rejects.toMatchObject({ status: 401 });
		expect(passkey.verifyRegistration).not.toHaveBeenCalled();
	});

	it('challengeId と credential を Supabase に渡し、成功なら ok を返す', async () => {
		await expect(
			callRemote(remote.verifyPasskeyRegistration, {
				challengeId: 'ch-reg',
				credential: CREDENTIAL
			})
		).resolves.toEqual({ ok: true });

		expect(passkey.verifyRegistration).toHaveBeenCalledWith({
			challengeId: 'ch-reg',
			credential: CREDENTIAL
		});
	});

	it('FR-016: Supabase のエラーは 400', async () => {
		passkey.verifyRegistration.mockResolvedValue({
			data: null,
			error: { name: 'AuthApiError', code: 'webauthn_verification_failed', status: 400 }
		});

		await expect(
			callRemote(remote.verifyPasskeyRegistration, {
				challengeId: 'ch-reg',
				credential: CREDENTIAL
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it.each([
		['challengeId が空', { challengeId: '', credential: CREDENTIAL }],
		['challengeId が文字列でない', { challengeId: 1, credential: CREDENTIAL }],
		['credential が無い', { challengeId: 'ch-reg' }],
		['credential が文字列', { challengeId: 'ch-reg', credential: 'x' }],
		['credential が null', { challengeId: 'ch-reg', credential: null }],
		['credential が配列', { challengeId: 'ch-reg', credential: [] }],
		['引数が無い', undefined]
	])('入力が不正（%s）なら 400 で、Supabase を呼ばない', async (_label, arg) => {
		await expect(callRemote(remote.verifyPasskeyRegistration, arg)).rejects.toMatchObject({
			status: 400,
			body: { message: 'Bad Request' }
		});
		expect(passkey.verifyRegistration).not.toHaveBeenCalled();
	});
});

describe('startPasskeyLogin（FR-017）', () => {
	it('ログインしていなくても challengeId と要求オプションを返す', async () => {
		signInAs(null);

		await expect(callRemote(remote.startPasskeyLogin)).resolves.toEqual({
			challengeId: 'ch-auth',
			options: { challenge: 'def' }
		});
	});

	it('FR-018: Supabase のエラーは 400', async () => {
		passkey.startAuthentication.mockResolvedValue({
			data: null,
			error: { name: 'AuthApiError', status: 500 }
		});

		await expect(callRemote(remote.startPasskeyLogin)).rejects.toMatchObject({ status: 400 });
	});
});

describe('verifyPasskeyLogin（FR-017, FR-018）', () => {
	it('スキーマを登録している', () => {
		expect(() => assertSchemaRegistered(remote.verifyPasskeyLogin)).not.toThrow();
	});

	it('ログインしていなくても challengeId と credential を渡し、セッションができれば ok', async () => {
		signInAs(null);

		await expect(
			callRemote(remote.verifyPasskeyLogin, { challengeId: 'ch-auth', credential: CREDENTIAL })
		).resolves.toEqual({ ok: true });

		expect(passkey.verifyAuthentication).toHaveBeenCalledWith({
			challengeId: 'ch-auth',
			credential: CREDENTIAL
		});
	});

	it('FR-018: Supabase のエラー（サービス側で削除済みのパスキー等）は 400', async () => {
		passkey.verifyAuthentication.mockResolvedValue({
			data: { session: null, user: null },
			error: { name: 'AuthApiError', code: 'passkey_not_found', status: 400 }
		});

		await expect(
			callRemote(remote.verifyPasskeyLogin, { challengeId: 'ch-auth', credential: CREDENTIAL })
		).rejects.toMatchObject({ status: 400 });
	});

	it('エラーが無くてもセッションができていなければ 400', async () => {
		passkey.verifyAuthentication.mockResolvedValue({
			data: { session: null, user: null },
			error: null
		});

		await expect(
			callRemote(remote.verifyPasskeyLogin, { challengeId: 'ch-auth', credential: CREDENTIAL })
		).rejects.toMatchObject({ status: 400 });
	});

	it.each([
		['challengeId が空', { challengeId: '', credential: CREDENTIAL }],
		['credential が文字列', { challengeId: 'ch-auth', credential: 'x' }],
		['credential が null', { challengeId: 'ch-auth', credential: null }],
		['引数が無い', undefined]
	])('入力が不正（%s）なら 400 で、Supabase を呼ばない', async (_label, arg) => {
		await expect(callRemote(remote.verifyPasskeyLogin, arg)).rejects.toMatchObject({
			status: 400,
			body: { message: 'Bad Request' }
		});
		expect(passkey.verifyAuthentication).not.toHaveBeenCalled();
	});
});
