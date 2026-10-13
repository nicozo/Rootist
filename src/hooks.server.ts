import type { Handle } from '@sveltejs/kit/hooks';
import { describeAuthError, isUnexpectedAuthError } from '#lib/server/auth-errors.js';
import { toAppUser } from '#lib/server/auth-user.js';
import { createSupabaseClient } from '#lib/server/supabase.js';

// issue #116: Supabase Authでログイン状態を判定して event.locals.user / event.locals.supabase を設定する。
// - 認証Cookie（sb-始まり）が無いリクエストではSupabaseへ通信しない（I-10）
// - Cookieがある場合はSupabase Authサーバーに問い合わせてユーザーを確認する（getUser。JWTの
//   ローカル検証だけにしない。ログアウト済みセッションのCookie再送をログイン中と扱わないため。I-4）
// - 確認はresolveより前に行う（トークン更新で書かれる新しいCookieをレスポンスに確実に載せるため）
// - 失敗・例外・到達不能はすべて user=null で通常どおりページを返す（500にしない。I-2）
// ルートガードは実装しない（既存方針の維持）。
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseClient(event);
	event.locals.user = null;

	const hasAuthCookie = event.cookies.getAll().some((c) => c.name.startsWith('sb-'));
	if (hasAuthCookie) {
		try {
			const { data, error } = await event.locals.supabase.auth.getUser();
			if (!error) {
				event.locals.user = toAppUser(data.user);
			} else if (isUnexpectedAuthError(error)) {
				// supabase-jsは障害・回数制限を例外でなく戻り値のerrorで返す。セッション無し・無効
				// （通常の未ログイン）は想定内なので出さず、それ以外は種別のみ記録する（値は出さない）
				console.error('hooks: getUser failed', describeAuthError(error));
			}
		} catch (err) {
			// Cookie・トークンの値は出さず、エラーの種別のみ記録する
			console.error('hooks: failed to verify user with Supabase Auth', {
				name: err instanceof Error ? err.name : typeof err
			});
		}
	}

	return resolve(event);
};
