import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { invalidateSessionToken } from '$lib/server/auth/session-store';
import { deleteSessionCookie } from '$lib/server/auth/cookies';

// GETアクセス（load）は / へリダイレクトする（ログアウトはPOST専用）
export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE_NAME);
		if (token) {
			await invalidateSessionToken(token);
		}
		deleteSessionCookie(cookies);
		redirect(303, '/');
	}
};
