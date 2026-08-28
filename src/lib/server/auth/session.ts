// セッショントークンの生成・ハッシュ化・有効期限ポリシーに関する純粋関数。
// DB（$lib/server/db）を一切importしないため、DATABASE_URL未設定・DB未接続でも単体テストできる。
// 実際のDB読み書きは session-store.ts に分離している。

import { randomBytes, createHash } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'auth_session';

/** セッション有効期間: 30日 */
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

/** 残りがこの期間未満になったらスライド延長する: 15日 */
export const SESSION_RENEWAL_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15;

/**
 * 256bit CSPRNGのセッショントークン（生値）を生成する。この値がCookieに入る。
 */
export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * セッショントークンをSHA-256でハッシュ化しhex文字列（64文字）にする。
 * DBの sessions.id にはこのハッシュ値のみを保存し、生値は保存しない。
 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * 現在時刻から30日後の有効期限を計算する。
 */
export function createSessionExpiry(now: Date = new Date()): Date {
	return new Date(now.getTime() + SESSION_DURATION_MS);
}

/**
 * 有効期限が閾値（15日）未満に迫っているか判定する（スライド延長すべきか）。
 */
export function shouldRenewSession(expiresAt: Date, now: Date = new Date()): boolean {
	return expiresAt.getTime() - now.getTime() < SESSION_RENEWAL_THRESHOLD_MS;
}

/**
 * セッションが期限切れかどうかを判定する。
 */
export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
	return expiresAt.getTime() <= now.getTime();
}
