// issue #49: Better Authのエラー（英語コード）をUIにそのまま見せないための日本語メッセージ変換。
// DBアクセス・Better Auth初期化を一切行わない純粋関数のみを置く（DATABASE_URL未設定でもテスト可能）。

export const EMAIL_FORMAT_MESSAGE = 'メールアドレスの形式が正しくありません';
export const PASSWORD_LENGTH_MESSAGE = 'パスワードは8文字以上で入力してください';
export const DUPLICATE_EMAIL_MESSAGE = 'このメールアドレスは既に登録されています';
export const LOGIN_FAILURE_MESSAGE = 'メールアドレスまたはパスワードが正しくありません';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;

/**
 * メールアドレスをtrim + 小文字化して正規化する。
 * Better Authに渡す前に必ずこの正規化後の値を使う（大文字違いの重複登録を防ぐため）。
 */
export function normalizeEmail(rawEmail: string): string {
	return rawEmail.trim().toLowerCase();
}

/**
 * 登録時のメール形式を事前チェックする（Better Auth未到達の簡易パターン）。
 * Better Auth自身のzodスキーマ検証（VALIDATION_ERROR）に到達する前に弾くことで、
 * 既存と同一の日本語メッセージを確実に返す（spec.md 2-6）。
 */
export function isValidEmailFormat(email: string): boolean {
	return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

/**
 * 登録名（Better Authのsign-up APIが必須とするnameフィールド）をメールのローカル部から機械的に生成する。
 * UIに名前入力欄は追加しない方針（spec.md 2-5）への対応。
 */
export function deriveNameFromEmail(email: string): string {
	const localPart = email.split('@')[0];
	return localPart && localPart.length > 0 ? localPart : email;
}

/**
 * 登録（signUpEmail）失敗時のBetter Authエラーコードを、既存と同一の日本語メッセージへ変換する。
 * 未知のコードはnullを返す（呼び出し側で汎用メッセージにフォールバックする）。
 */
export function mapSignUpErrorCode(code: string | undefined): string | null {
	switch (code) {
		case 'INVALID_EMAIL':
		case 'VALIDATION_ERROR':
			return EMAIL_FORMAT_MESSAGE;
		case 'PASSWORD_TOO_SHORT':
		case 'PASSWORD_TOO_LONG':
		case 'INVALID_PASSWORD':
			return PASSWORD_LENGTH_MESSAGE;
		case 'USER_ALREADY_EXISTS':
		case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
			return DUPLICATE_EMAIL_MESSAGE;
		default:
			return null;
	}
}
