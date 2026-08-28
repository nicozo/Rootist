import type { LayoutServerLoad } from './$types';

// 全ページ共通の認証ナビ表示のため、ログインユーザーの情報をdataとして渡す。
// issue #54: アバター＋メニュー表示のためname/imageを追加（idはUIに不要なため渡さない）。
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user
			? { email: locals.user.email, name: locals.user.name, image: locals.user.image }
			: null
	};
};
