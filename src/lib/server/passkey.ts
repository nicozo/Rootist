// issue #189: パスキーの 2 段階 API（Supabase Auth）を呼ぶロジック。
// ブラウザは WebAuthn の操作だけを行い、challenge の発行と検証はサーバーで行う
// （認証 Cookie を HttpOnly のまま保つため。research.md R4）。
import { error } from '@sveltejs/kit';
import type { SupabaseServerClient } from '#lib/server/supabase.js';
import { describeAuthError, type AuthErrorLike } from '#lib/server/auth-errors.js';
import type { VerifyPasskeyInput } from '#lib/schemas/passkey.js';

type AuthClient = Pick<SupabaseServerClient, 'auth'>;
type LoggedInUser = { id: string } | null;

/** 画面へ返すエラーの文言（Supabase のメッセージは返さない）。画面側は成否だけを見る */
const PASSKEY_FAILURE_MESSAGE = 'パスキーの操作に失敗しました';

function fail(label: string, authError: AuthErrorLike | null): never {
	if (authError) console.error(`passkey: ${label} failed`, describeAuthError(authError));
	error(400, PASSKEY_FAILURE_MESSAGE);
}

function requireUser(user: LoggedInUser): void {
	if (!user) error(401, 'ログインが必要です');
}

export async function startPasskeyRegistration(supabase: AuthClient, user: LoggedInUser) {
	requireUser(user);
	const { data, error: authError } = await supabase.auth.passkey.startRegistration();
	if (authError || !data) fail('startRegistration', authError);
	return { challengeId: data.challenge_id, options: data.options };
}

export async function verifyPasskeyRegistration(
	supabase: AuthClient,
	user: LoggedInUser,
	input: VerifyPasskeyInput
) {
	requireUser(user);
	const { error: authError } = await supabase.auth.passkey.verifyRegistration({
		challengeId: input.challengeId,
		// WebAuthn の JSON の検査は Supabase Auth が行う（schemas/passkey.ts）
		credential: input.credential as never
	});
	if (authError) fail('verifyRegistration', authError);
	return { ok: true as const };
}

export async function startPasskeyLogin(supabase: AuthClient) {
	const { data, error: authError } = await supabase.auth.passkey.startAuthentication();
	if (authError || !data) fail('startAuthentication', authError);
	return { challengeId: data.challenge_id, options: data.options };
}

/** 成功するとセッションができ、サーバー用クライアントが HttpOnly の Cookie に書く */
export async function verifyPasskeyLogin(supabase: AuthClient, input: VerifyPasskeyInput) {
	const { data, error: authError } = await supabase.auth.passkey.verifyAuthentication({
		challengeId: input.challengeId,
		credential: input.credential as never
	});
	if (authError || !data?.session) fail('verifyAuthentication', authError);
	return { ok: true as const };
}
