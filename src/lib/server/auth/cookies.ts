// セッションCookieの設定・削除を一箇所に集約する（hooks / register / login / logout で共通利用）。

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from './session';

export function setSessionCookie(cookies: Cookies, token: string): void {
	cookies.set(SESSION_COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_DURATION_MS / 1000
	});
}

export function deleteSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}
