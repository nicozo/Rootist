import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import type { Actions, PageServerLoad } from './$types';
import { auth, isGoogleAuthEnabled } from '$lib/server/auth';
import {
	normalizeEmail,
	isValidEmailFormat,
	deriveNameFromEmail,
	mapSignUpErrorCode,
	EMAIL_FORMAT_MESSAGE
} from '$lib/server/auth-errors';

// ログイン済みユーザーが /register にアクセスしたら /plan へリダイレクトする
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/plan');
	}

	// issue #42: Rev.2契約で追加。/loginと同様、環境変数未設定時はボタン非表示にするための
	// フラグをサーバーでのみ判定して渡す（環境変数の値自体はクライアントへ渡さない）。
	return { googleAuthEnabled: isGoogleAuthEnabled };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const rawEmail = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');

		const email = normalizeEmail(rawEmail);

		// Better Auth自身のzodスキーマ検証（VALIDATION_ERROR、汎用英語メッセージ）に到達する前に、
		// 既存と同一の日本語メッセージを確実に返すための事前チェック（spec.md 2-6）
		if (!isValidEmailFormat(email)) {
			return fail(400, { message: EMAIL_FORMAT_MESSAGE, email: rawEmail });
		}

		// Better Authのsign-up APIはnameを必須とする。UIに名前入力欄は追加しない方針のため、
		// メールのローカル部から機械的に生成する（spec.md 2-5）
		const name = deriveNameFromEmail(email);

		try {
			// autoSignIn: true（auth.ts）のため、成功時はそのままセッションCookieが発行される
			// （sveltekit-cookiesプラグインがevent.cookiesへ自動転送する）
			await auth.api.signUpEmail({ body: { name, email, password } });
		} catch (err) {
			if (err instanceof APIError) {
				// 既知のエラーコード以外（想定外のBetter Auth内部エラー等）は汎用メッセージにする
				const message =
					mapSignUpErrorCode(err.body?.code) ?? '登録に失敗しました。もう一度お試しください。';
				return fail(400, { message, email: rawEmail });
			}
			// Better AuthのAPIErrorではない想定外の例外。公開エンドポイントで未捕捉例外を
			// そのまま500として露出させず、汎用メッセージにフォールバックする（ログには残す）。
			console.error('register action: unexpected non-APIError exception', err);
			return fail(400, {
				message: '登録に失敗しました。もう一度お試しください。',
				email: rawEmail
			});
		}

		redirect(303, '/plan');
	}
};
