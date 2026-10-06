import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isGoogleAuthEnabled } from '#lib/server/supabase.js';

// GETアクセスは /login へ戻す（Googleログインの開始はPOST専用）
export const load: PageServerLoad = async () => {
	redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ locals, url }) => {
		// 無効な環境（Supabase側のGoogle設定が未完了）では開始させない
		if (!isGoogleAuthEnabled) error(404, 'Not Found');

		let authUrl: string | null = null;
		try {
			const { data, error: signInError } = await locals.supabase.auth.signInWithOAuth({
				provider: 'google',
				options: { redirectTo: `${url.origin}/auth/callback`, skipBrowserRedirect: true }
			});
			if (signInError) {
				console.error('google login: signInWithOAuth failed', { code: signInError.code });
			} else {
				authUrl = data.url;
			}
		} catch (err) {
			console.error('google login: unexpected exception', err);
		}

		// redirectはtry/catchの外（リダイレクトの例外を誤って捕捉しないため）
		redirect(303, authUrl ?? '/login?error=google');
	}
};
