// issue #189: メールのコード（Supabase Auth のメール OTP）での登録・ログインの form action。
// /login と /register が同じ手順（FR-006 の「登録とログインを同じ手順にする」）で使う。
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { resolvePostLoginPath } from '#lib/server/post-login.js';
import {
	CODE_INVALID_MESSAGE,
	EMAIL_FORMAT_MESSAGE,
	SEND_FAILURE_MESSAGE,
	deriveNameFromEmail,
	describeAuthError,
	isUnexpectedAuthError,
	isValidEmailFormat,
	mapSendCodeErrorCode,
	mapVerifyCodeErrorCode,
	normalizeEmail
} from '#lib/server/auth-errors.js';

type ActionEvent = Pick<RequestEvent, 'request' | 'locals'>;

const CODE_PATTERN = /^\d{6}$/;

/**
 * コードを送る。成功したらコード入力の画面（step: 'code'）へ。登録の有無で応答を変えない（FR-024）。
 * コード入力の画面からの再送（resend=1）の失敗は、その画面にとどまる。
 */
export async function sendCode({ request, locals }: ActionEvent) {
	const formData = await request.formData();
	const rawEmail = String(formData.get('email') ?? '');
	const failureStep: 'code' | 'email' = formData.get('resend') === '1' ? 'code' : 'email';
	const email = normalizeEmail(rawEmail);
	// 再送のときの email は、コード入力の画面が持っている正規化済みの値
	const failureEmail = failureStep === 'code' ? email : rawEmail;

	if (!isValidEmailFormat(email)) {
		return fail(400, { step: failureStep, message: EMAIL_FORMAT_MESSAGE, email: failureEmail });
	}

	try {
		// shouldCreateUser: true で登録の無いアドレスにも同じ手順でアカウントを作る。
		// data は作成時だけ user_metadata に入り、既存ユーザーの表示名は変わらない（FR-006, FR-007）
		const { error } = await locals.supabase.auth.signInWithOtp({
			email,
			options: { shouldCreateUser: true, data: { name: deriveNameFromEmail(email) } }
		});
		if (error) {
			const message = mapSendCodeErrorCode(error.code);
			if (message === SEND_FAILURE_MESSAGE || isUnexpectedAuthError(error)) {
				console.error('sendCode action: signInWithOtp failed', describeAuthError(error));
			}
			return fail(400, { step: failureStep, message, email: failureEmail });
		}
	} catch (err) {
		console.error('sendCode action: unexpected exception', err);
		return fail(400, { step: failureStep, message: SEND_FAILURE_MESSAGE, email: failureEmail });
	}

	return { step: 'code' as const, email };
}

/** コードを確認してログインさせる。成功したら行き先（/passkey か /plan）へ 303 */
export async function verifyCode({ request, locals }: ActionEvent) {
	const formData = await request.formData();
	const email = normalizeEmail(String(formData.get('email') ?? ''));
	const code = String(formData.get('code') ?? '').trim();

	const invalid = () => fail(400, { step: 'code' as const, message: CODE_INVALID_MESSAGE, email });
	// 6 桁の数字でないコードは Supabase に送らない（回数制限を無駄に使わない）
	if (!CODE_PATTERN.test(code)) return invalid();

	try {
		const { error } = await locals.supabase.auth.verifyOtp({ email, token: code, type: 'email' });
		if (error) {
			if (isUnexpectedAuthError(error)) {
				console.error('verifyCode action: verifyOtp failed', describeAuthError(error));
			}
			return fail(400, {
				step: 'code' as const,
				message: mapVerifyCodeErrorCode(error.code),
				email
			});
		}
	} catch (err) {
		console.error('verifyCode action: unexpected exception', err);
		return invalid();
	}

	// redirect は try/catch の外（リダイレクトの例外を誤って捕捉しないため）
	redirect(303, await resolvePostLoginPath(locals.supabase));
}
