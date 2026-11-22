import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// issue #189: ブラウザの WebAuthn 操作（passkey-client.ts）のテスト。
// remote function（サーバー）は差し替え、navigator.credentials と PublicKeyCredential は偽物にする。

const remote = vi.hoisted(() => ({
	startPasskeyRegistration: vi.fn(),
	verifyPasskeyRegistration: vi.fn(),
	startPasskeyLogin: vi.fn(),
	verifyPasskeyLogin: vi.fn()
}));

vi.mock('#lib/remote/passkey.remote.js', () => remote);

const { isPasskeySupported, registerPasskey, signInWithPasskey } = await import('./passkey-client');

const SERVER_OPTIONS = { challenge: 'abc' };
const PARSED_OPTIONS = { challenge: new Uint8Array([1]) };
const CREDENTIAL_JSON = { id: 'cred-1', type: 'public-key' };

/** PublicKeyCredential の偽物（JSON 変換の有無で対応判定が変わる）。 */
function stubPublicKeyCredential(
	overrides: Record<string, unknown> = {}
): ReturnType<typeof vi.fn>[] {
	const parseCreationOptionsFromJSON = vi.fn().mockReturnValue(PARSED_OPTIONS);
	const parseRequestOptionsFromJSON = vi.fn().mockReturnValue(PARSED_OPTIONS);
	vi.stubGlobal(
		'PublicKeyCredential',
		Object.assign(function () {}, {
			parseCreationOptionsFromJSON,
			parseRequestOptionsFromJSON,
			...overrides
		})
	);
	return [parseCreationOptionsFromJSON, parseRequestOptionsFromJSON];
}

function stubCredentials(impl: { create?: unknown; get?: unknown }) {
	const credential = { toJSON: () => CREDENTIAL_JSON };
	const create = vi
		.spyOn(navigator.credentials, 'create')
		.mockImplementation(async () => (impl.create ?? credential) as Credential);
	const get = vi
		.spyOn(navigator.credentials, 'get')
		.mockImplementation(async () => (impl.get ?? credential) as Credential);
	return { create, get };
}

beforeEach(() => {
	remote.startPasskeyRegistration.mockResolvedValue({
		challengeId: 'ch-reg',
		options: SERVER_OPTIONS
	});
	remote.verifyPasskeyRegistration.mockResolvedValue({ ok: true });
	remote.startPasskeyLogin.mockResolvedValue({ challengeId: 'ch-auth', options: SERVER_OPTIONS });
	remote.verifyPasskeyLogin.mockResolvedValue({ ok: true });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('isPasskeySupported（FR-019）', () => {
	it('PublicKeyCredential と JSON 変換があれば対応', () => {
		stubPublicKeyCredential();
		stubCredentials({});

		expect(isPasskeySupported()).toBe(true);
	});

	it('PublicKeyCredential が無ければ非対応', () => {
		vi.stubGlobal('PublicKeyCredential', undefined);

		expect(isPasskeySupported()).toBe(false);
	});

	it.each(['parseCreationOptionsFromJSON', 'parseRequestOptionsFromJSON'])(
		'%s が無ければ非対応',
		(missing) => {
			stubPublicKeyCredential({ [missing]: undefined });
			stubCredentials({});

			expect(isPasskeySupported()).toBe(false);
		}
	);
});

describe('registerPasskey（FR-014, FR-016）', () => {
	it('サーバーの options を変換して端末の確認を行い、credential をサーバーに渡して true', async () => {
		const [parseCreation] = stubPublicKeyCredential();
		const { create } = stubCredentials({});

		await expect(registerPasskey()).resolves.toBe(true);

		expect(parseCreation).toHaveBeenCalledWith(SERVER_OPTIONS);
		expect(create).toHaveBeenCalledWith({ publicKey: PARSED_OPTIONS });
		expect(remote.verifyPasskeyRegistration).toHaveBeenCalledWith({
			challengeId: 'ch-reg',
			credential: CREDENTIAL_JSON
		});
	});

	it('端末の確認の取り消し（NotAllowedError）は false で、サーバーに検証を頼まない', async () => {
		stubPublicKeyCredential();
		const { create } = stubCredentials({});
		create.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));

		await expect(registerPasskey()).resolves.toBe(false);

		expect(remote.verifyPasskeyRegistration).not.toHaveBeenCalled();
	});

	it('端末の確認が credential を返さなければ false', async () => {
		stubPublicKeyCredential();
		const { create } = stubCredentials({});
		create.mockResolvedValue(null);

		await expect(registerPasskey()).resolves.toBe(false);

		expect(remote.verifyPasskeyRegistration).not.toHaveBeenCalled();
	});

	it('サーバーが options の発行に失敗したら false（例外を外へ出さない）', async () => {
		stubPublicKeyCredential();
		const { create } = stubCredentials({});
		remote.startPasskeyRegistration.mockRejectedValue(new Error('400'));

		await expect(registerPasskey()).resolves.toBe(false);

		expect(create).not.toHaveBeenCalled();
	});

	it('サーバーの検証が失敗したら false', async () => {
		stubPublicKeyCredential();
		stubCredentials({});
		remote.verifyPasskeyRegistration.mockRejectedValue(new Error('400'));

		await expect(registerPasskey()).resolves.toBe(false);
	});
});

describe('signInWithPasskey（FR-017, FR-018）', () => {
	it('サーバーの options を変換して端末の確認を行い、credential をサーバーに渡して true', async () => {
		const [, parseRequest] = stubPublicKeyCredential();
		const { get } = stubCredentials({});

		await expect(signInWithPasskey()).resolves.toBe(true);

		expect(parseRequest).toHaveBeenCalledWith(SERVER_OPTIONS);
		expect(get).toHaveBeenCalledWith({ publicKey: PARSED_OPTIONS });
		expect(remote.verifyPasskeyLogin).toHaveBeenCalledWith({
			challengeId: 'ch-auth',
			credential: CREDENTIAL_JSON
		});
	});

	it('端末の確認の取り消し（NotAllowedError）は false で、サーバーに検証を頼まない', async () => {
		stubPublicKeyCredential();
		const { get } = stubCredentials({});
		get.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));

		await expect(signInWithPasskey()).resolves.toBe(false);

		expect(remote.verifyPasskeyLogin).not.toHaveBeenCalled();
	});

	it('サーバーの検証が失敗（削除済みのパスキー等）したら false', async () => {
		stubPublicKeyCredential();
		stubCredentials({});
		remote.verifyPasskeyLogin.mockRejectedValue(new Error('400'));

		await expect(signInWithPasskey()).resolves.toBe(false);
	});

	it('サーバーが options の発行に失敗したら false', async () => {
		stubPublicKeyCredential();
		stubCredentials({});
		remote.startPasskeyLogin.mockRejectedValue(new Error('400'));

		await expect(signInWithPasskey()).resolves.toBe(false);
	});
});
