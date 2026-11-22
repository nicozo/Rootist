import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isGoogleAuthEnabled } from '#lib/server/supabase.js';
import { sendCode, verifyCode } from '#lib/server/email-code-actions.js';

// ログイン済みユーザーが /register にアクセスしたら /plan へリダイレクトする（FR-026）
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/plan');
	}

	// 環境変数未設定時はボタン非表示にするためのフラグをサーバーでのみ判定して渡す。
	return { googleAuthEnabled: isGoogleAuthEnabled };
};

// メールのコードでの登録・ログイン（issue #189）。/login と同じ action（登録とログインは同じ手順）
export const actions: Actions = { sendCode, verifyCode };
