import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { validateSessionToken } from '$lib/server/auth/session-store';
import { setSessionCookie, deleteSessionCookie } from '$lib/server/auth/cookies';

// 全リクエストでセッションCookieを検証し、locals.user / locals.session を載せる。
// ルートガードは実装しない（本issueに保護ページは存在しない）。既存の公開エンドポイント
// （/api/plans・/api/route・/plan/share/[shareId]等）の認可・挙動には一切影響を与えない。
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE_NAME);

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const result = await validateSessionToken(token);

	if (!result.user) {
		// 期限切れ・不一致セッション。DB側の削除は validateSessionToken 内で完結しているため、
		// ここではCookieだけ確実に破棄する。
		deleteSessionCookie(event.cookies);
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	event.locals.user = result.user;
	event.locals.session = result.session;

	if (result.renewed) {
		setSessionCookie(event.cookies, token);
	}

	return resolve(event);
};
