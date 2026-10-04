import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isGoogleAuthEnabled } from '$lib/server/supabase';
import {
	normalizeEmail,
	isValidEmailFormat,
	deriveNameFromEmail,
	checkPasswordLength,
	mapSignUpErrorCode,
	describeAuthError,
	isUnexpectedAuthError,
	EMAIL_FORMAT_MESSAGE,
	REGISTER_FAILURE_MESSAGE
} from '$lib/server/auth-errors';

// ログイン済みユーザーが /register にアクセスしたら /plan へリダイレクトする
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/plan');
	}

	// 環境変数未設定時はボタン非表示にするためのフラグをサーバーでのみ判定して渡す。
	return { googleAuthEnabled: isGoogleAuthEnabled };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const rawEmail = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');

		const email = normalizeEmail(rawEmail);

		// Supabaseに送る前の事前チェック（ブラウザの検証を迂回した送信でも同じ結果にする）
		if (!isValidEmailFormat(email)) {
			return fail(400, { message: EMAIL_FORMAT_MESSAGE, email: rawEmail });
		}
		const passwordMessage = checkPasswordLength(password);
		if (passwordMessage) {
			return fail(400, { message: passwordMessage, email: rawEmail });
		}

		let hasSession = false;
		try {
			// UIに名前入力欄は追加しない方針のため、メールのローカル部を表示名として保存する
			const { data, error } = await locals.supabase.auth.signUp({
				email,
				password,
				options: { data: { name: deriveNameFromEmail(email) } }
			});
			if (error) {
				const mapped = mapSignUpErrorCode(error.code);
				// 未知のエラー・ネットワーク障害・回数制限は運用で観測できるよう種別のみ記録する
				if (mapped === null || isUnexpectedAuthError(error)) {
					console.error('register action: signUp failed', describeAuthError(error));
				}
				const message = mapped ?? REGISTER_FAILURE_MESSAGE;
				return fail(400, { message, email: rawEmail });
			}
			hasSession = data.session !== null;
		} catch (err) {
			// 想定外の例外（ネットワーク障害等）を500として露出させず、汎用メッセージにする
			console.error('register action: unexpected exception', err);
			return fail(400, { message: REGISTER_FAILURE_MESSAGE, email: rawEmail });
		}

		if (!hasSession) {
			// エラーが無いのにセッションが返らない＝Supabaseダッシュボードで「Confirm email」がONのまま
			// （設定不備）。ログインしていないのにログイン済みの導線へ進めない。
			console.error(
				'register action: signUp returned no session. "Confirm email" may be ON in the Supabase dashboard'
			);
			return fail(400, { message: REGISTER_FAILURE_MESSAGE, email: rawEmail });
		}

		// redirectはtry/catchの外（リダイレクトの例外を誤って捕捉しないため）
		redirect(303, '/plan');
	}
};
