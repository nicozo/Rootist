import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isGoogleAuthEnabled } from '$lib/server/supabase';
import {
	normalizeEmail,
	mapSignInErrorCode,
	describeAuthError,
	isUnexpectedAuthError,
	LOGIN_FAILURE_MESSAGE
} from '$lib/server/auth-errors';

// Googleログイン失敗時に戻ってきたエラーを画面表示用の固定日本語メッセージに変換する。
// 生のエラーコード（?errorの値そのもの）は画面に出さない。
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
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const rawEmail = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');

		const email = normalizeEmail(rawEmail);

		// メール不存在・誤パスワード・形式不備・メール未確認・想定外例外のいずれも区別せず
		// 同一の統一メッセージにする（アカウント存在推測の抑制）。回数制限だけは
		// アカウントの有無と無関係なので別メッセージにしてよい。
		// 形式・長さチェックでの早期returnは行わない（何を入れても失敗時は同じ応答）。
		try {
			const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
			if (error) {
				// 誤パスワード等の通常の失敗は出さず、障害・回数制限だけ種別を記録する
				if (isUnexpectedAuthError(error)) {
					console.error('login action: signInWithPassword failed', describeAuthError(error));
				}
				return fail(400, { message: mapSignInErrorCode(error.code), email: rawEmail });
			}
		} catch (err) {
			// 想定外の例外を500として露出させず、統一メッセージにフォールバックする（ログには残す）
			console.error('login action: unexpected exception', err);
			return fail(400, { message: LOGIN_FAILURE_MESSAGE, email: rawEmail });
		}

		redirect(303, '/plan');
	}
};
