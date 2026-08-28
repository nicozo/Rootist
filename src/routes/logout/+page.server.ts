import { redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';

// GETアクセス（load）は / へリダイレクトする（ログアウトはPOST専用）
export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request }) => {
		try {
			// headersにCookieを含めて渡すことで、Better Authが対象セッションを特定し
			// DB側の無効化＋Cookie破棄（Set-Cookie: Max-Age=0）を行う
			// （sveltekit-cookiesプラグインがevent.cookiesへ自動転送する）
			await auth.api.signOut({ headers: request.headers });
		} catch (err) {
			// 未ログイン状態でのログアウト等、セッションが無くてもエラーにはしない
			if (!(err instanceof APIError)) throw err;
		}
		redirect(303, '/');
	}
};
