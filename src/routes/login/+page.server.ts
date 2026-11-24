import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isGoogleAuthEnabled } from '#lib/server/supabase.js';

// Googleログイン失敗時に戻ってきたエラーを画面表示用の固定日本語メッセージに変換する。
// 生のエラーコード（?errorの値そのもの）は画面に出さない。
const GOOGLE_LOGIN_FAILURE_MESSAGE =
	'Googleログインを完了できませんでした。もう一度お試しください。';

// ログイン済みユーザーが /login にアクセスしたら /plan へリダイレクトする（FR-008）
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
