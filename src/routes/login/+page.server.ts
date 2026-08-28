import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import type { Actions, PageServerLoad } from './$types';
import { auth, isGoogleAuthEnabled } from '$lib/server/auth';
import { normalizeEmail, LOGIN_FAILURE_MESSAGE } from '$lib/server/auth-errors';

// issue #42: /auth/googleのerrorCallbackURLから戻ってきたエラーを画面表示用の
// 固定日本語メッセージに変換する。生のエラーコード（?errorの値そのもの）は画面に出さない
// （不変条件5、spec.md 2-3(3)）。
const GOOGLE_LOGIN_FAILURE_MESSAGE =
	'Googleログインを完了できませんでした。もう一度お試しください。';

// ログイン済みユーザーが /login にアクセスしたら /plan へリダイレクトする
export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		redirect(303, '/plan');
	}

	const googleError = url.searchParams.has('error');

	return {
		googleAuthEnabled: isGoogleAuthEnabled,
		googleError: googleError ? GOOGLE_LOGIN_FAILURE_MESSAGE : null
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const rawEmail = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');

		const email = normalizeEmail(rawEmail);

		// メール不存在・誤パスワード・形式不備のいずれも区別せず、Better Authが投げるエラーを
		// すべて同一の統一メッセージに変換する（不変条件3: アカウント存在推測の抑制）。
		// タイミング攻撃緩和（ダミーhash verify）はBetter Authの内部実装に委ねる（spec.md 2-8）ため、
		// ここで早期returnによるショートカットは行わない。
		try {
			await auth.api.signInEmail({ body: { email, password } });
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: LOGIN_FAILURE_MESSAGE, email: rawEmail });
			}
			// Better AuthのAPIErrorではない想定外の例外。公開エンドポイントで未捕捉例外を
			// そのまま500として露出させず、統一メッセージにフォールバックする（ログには残す）。
			console.error('login action: unexpected non-APIError exception', err);
			return fail(400, { message: LOGIN_FAILURE_MESSAGE, email: rawEmail });
		}

		redirect(303, '/plan');
	}
};
