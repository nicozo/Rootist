// セッションのDB読み書き。判定ロジック（有効期限・延長要否）は session.ts の純粋関数に委譲する。

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import {
	createSessionExpiry,
	hashSessionToken,
	isSessionExpired,
	shouldRenewSession
} from './session';

export type AuthenticatedUser = { id: number; email: string };
export type AuthenticatedSession = { id: string; expiresAt: Date };

export type SessionValidationResult =
	| { user: AuthenticatedUser; session: AuthenticatedSession; renewed: boolean }
	| { user: null; session: null; renewed: false };

/**
 * ログイン成功時にセッションを新規発行する。tokenはCookieに入る生値、DBにはハッシュのみ保存する。
 */
export async function createSession(token: string, userId: number): Promise<AuthenticatedSession> {
	const id = hashSessionToken(token);
	const expiresAt = createSessionExpiry();
	await db.insert(sessions).values({ id, userId, expiresAt });
	return { id, expiresAt };
}

/**
 * Cookieのトークン生値からセッションを検証する。
 * - 該当セッションが無ければゲスト扱い
 * - 期限切れならDBから削除しゲスト扱い
 * - 残り期間が閾値未満ならスライド延長してDBを更新する
 */
export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
	const id = hashSessionToken(token);

	const rows = await db
		.select({
			sessionId: sessions.id,
			expiresAt: sessions.expiresAt,
			userId: users.id,
			email: users.email
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id));

	const row = rows[0];
	if (!row) {
		return { user: null, session: null, renewed: false };
	}

	if (isSessionExpired(row.expiresAt)) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return { user: null, session: null, renewed: false };
	}

	let expiresAt = row.expiresAt;
	let renewed = false;
	if (shouldRenewSession(row.expiresAt)) {
		expiresAt = createSessionExpiry();
		await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
		renewed = true;
	}

	return {
		user: { id: row.userId, email: row.email },
		session: { id: row.sessionId, expiresAt },
		renewed
	};
}

/**
 * ログアウト・ログイン済み再アクセス無効化のためセッションをDBから削除する。
 */
export async function invalidateSessionToken(token: string): Promise<void> {
	const id = hashSessionToken(token);
	await db.delete(sessions).where(eq(sessions.id, id));
}
