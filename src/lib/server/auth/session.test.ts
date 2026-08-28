import { describe, expect, it } from 'vitest';
import {
	generateSessionToken,
	hashSessionToken,
	createSessionExpiry,
	shouldRenewSession,
	isSessionExpired,
	SESSION_DURATION_MS,
	SESSION_RENEWAL_THRESHOLD_MS
} from './session';

describe('generateSessionToken', () => {
	it('base64urlの256bit相当のトークンを生成する', () => {
		const token = generateSessionToken();
		// 32バイトのbase64url（パディング無し）はおおよそ43文字
		expect(token.length).toBeGreaterThanOrEqual(42);
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('毎回異なるトークンを生成する', () => {
		const a = generateSessionToken();
		const b = generateSessionToken();
		expect(a).not.toBe(b);
	});
});

describe('hashSessionToken', () => {
	it('SHA-256のhex文字列（64文字）を返す', () => {
		const hash = hashSessionToken('example-token');
		expect(hash).toHaveLength(64);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('同じトークンからは同じハッシュが得られる（決定的）', () => {
		expect(hashSessionToken('same-token')).toBe(hashSessionToken('same-token'));
	});

	it('生トークンとハッシュ値が一致しない', () => {
		const token = generateSessionToken();
		expect(hashSessionToken(token)).not.toBe(token);
	});
});

describe('createSessionExpiry', () => {
	it('基準時刻から30日後を返す', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const expiry = createSessionExpiry(now);
		expect(expiry.getTime() - now.getTime()).toBe(SESSION_DURATION_MS);
	});
});

describe('shouldRenewSession', () => {
	it('残り15日未満なら延長対象と判定する', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const expiresAt = new Date(now.getTime() + SESSION_RENEWAL_THRESHOLD_MS - 1);
		expect(shouldRenewSession(expiresAt, now)).toBe(true);
	});

	it('残り15日ちょうどなら延長対象にしない', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const expiresAt = new Date(now.getTime() + SESSION_RENEWAL_THRESHOLD_MS);
		expect(shouldRenewSession(expiresAt, now)).toBe(false);
	});

	it('残り30日（新規発行直後）なら延長対象にしない', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const expiresAt = createSessionExpiry(now);
		expect(shouldRenewSession(expiresAt, now)).toBe(false);
	});
});

describe('isSessionExpired', () => {
	it('有効期限が過去なら期限切れと判定する', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const expiresAt = new Date(now.getTime() - 1);
		expect(isSessionExpired(expiresAt, now)).toBe(true);
	});

	it('有効期限がちょうど現在時刻なら期限切れと判定する', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		expect(isSessionExpired(now, now)).toBe(true);
	});

	it('有効期限が未来なら期限切れではないと判定する', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const expiresAt = new Date(now.getTime() + 1);
		expect(isSessionExpired(expiresAt, now)).toBe(false);
	});
});
