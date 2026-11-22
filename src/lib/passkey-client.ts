// issue #189: ブラウザの WebAuthn 操作。challenge の発行と検証は remote function（サーバー）が行い、
// ここは options を変換して端末の確認（navigator.credentials）を行うだけ（research.md R4）。
// 取り消し（NotAllowedError）も失敗も、呼び出し側には成否（boolean）だけを返す（FR-016, FR-018）。
import {
	startPasskeyLogin,
	startPasskeyRegistration,
	verifyPasskeyLogin,
	verifyPasskeyRegistration
} from '#lib/remote/passkey.remote.js';

/** パスキーに対応したブラウザか。JSON 変換（parse*OptionsFromJSON）が無いブラウザは非対応と見なす（FR-019） */
export function isPasskeySupported(): boolean {
	return (
		typeof PublicKeyCredential !== 'undefined' &&
		typeof PublicKeyCredential.parseCreationOptionsFromJSON === 'function' &&
		typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function'
	);
}

type SerializableCredential = Credential & { toJSON(): Record<string, unknown> };

/** 端末の確認が credential を返したときだけ JSON にして返す */
function serialize(credential: Credential | null): Record<string, unknown> | null {
	return credential && 'toJSON' in credential
		? (credential as SerializableCredential).toJSON()
		: null;
}

/** パスキーを登録する。端末の確認の取り消し・失敗は false */
export async function registerPasskey(): Promise<boolean> {
	try {
		const { challengeId, options } = await startPasskeyRegistration();
		const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(
			options as PublicKeyCredentialCreationOptionsJSON
		);
		const credential = serialize(await navigator.credentials.create({ publicKey }));
		if (!credential) return false;
		await verifyPasskeyRegistration({ challengeId, credential });
		return true;
	} catch {
		return false;
	}
}

/** パスキーでログインする。成功するとサーバーがセッションの Cookie を書く。取り消し・失敗は false */
export async function signInWithPasskey(): Promise<boolean> {
	try {
		const { challengeId, options } = await startPasskeyLogin();
		const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(
			options as PublicKeyCredentialRequestOptionsJSON
		);
		const credential = serialize(await navigator.credentials.get({ publicKey }));
		if (!credential) return false;
		await verifyPasskeyLogin({ challengeId, credential });
		return true;
	} catch {
		return false;
	}
}
