import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// GETアクセス（load）は / へリダイレクトする（ログアウトはPOST専用）
export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		try {
			// この端末のセッションのみ無効化する（他端末のセッションは切らない）
			const { error } = await locals.supabase.auth.signOut({ scope: 'local' });
			if (error) console.error('logout action: signOut returned an error', { code: error.code });
		} catch (err) {
			// 未ログイン・Supabase到達不能でも500にしない（ログには残す）
			console.error('logout action: unexpected exception', err);
		} finally {
			// Supabase側の無効化に失敗しても、少なくともこのブラウザはログアウト状態にする。
			// チャンク(.0/.1)も含め sb- 始まりの認証Cookieをすべて消す（sb-以外は消さない）。
			// getAll()は同一リクエスト内でsetされたCookieも含む。
			for (const { name } of cookies.getAll()) {
				if (name.startsWith('sb-')) cookies.delete(name, { path: '/' });
			}
		}
		redirect(303, '/');
	}
};
