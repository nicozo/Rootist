import type { LayoutServerLoad } from './$types';

// 全ページ共通の認証ナビ表示のため、ログインユーザーのメールアドレスをdataとして渡す。
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user ? { email: locals.user.email } : null
	};
};
