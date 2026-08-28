// 登録・ログインで共通利用するバリデーション（純粋関数のみ）。
// DBアクセスを一切行わないため、DATABASE_URL未設定・DB未接続でも単体テストできる。

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 255;

export type ValidationResult = { ok: true } | { ok: false; message: string };

export const EMAIL_FORMAT_MESSAGE = 'メールアドレスの形式が正しくありません';
export const PASSWORD_LENGTH_MESSAGE = 'パスワードは8文字以上で入力してください';
export const DUPLICATE_EMAIL_MESSAGE = 'このメールアドレスは既に登録されています';
export const LOGIN_FAILURE_MESSAGE = 'メールアドレスまたはパスワードが正しくありません';

/**
 * メールアドレスをtrim + 小文字化して正規化する。
 * DBへの保存・検索は必ずこの正規化後の値を使う（大文字違いの重複登録を防ぐため）。
 */
export function normalizeEmail(rawEmail: string): string {
	return rawEmail.trim().toLowerCase();
}

/**
 * 正規化済みメールアドレスの形式を検証する。
 * 過剰に厳密なRFC準拠検証はせず、「名前@ドメイン.tld」程度の簡易パターンとする。
 */
export function validateEmail(email: string): ValidationResult {
	if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
		return { ok: false, message: EMAIL_FORMAT_MESSAGE };
	}
	return { ok: true };
}

/**
 * パスワード強度を検証する。NIST SP 800-63Bに沿い長さのみを要求し、文字種の複雑性は強制しない。
 */
export function validatePassword(password: string): ValidationResult {
	if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
		return { ok: false, message: PASSWORD_LENGTH_MESSAGE };
	}
	return { ok: true };
}
