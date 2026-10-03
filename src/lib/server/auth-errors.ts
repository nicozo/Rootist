// issue #116: Supabase Authのエラー（英語コード）をUIにそのまま見せないための日本語メッセージ変換。
// DBアクセス・Supabaseクライアント初期化を一切行わない純粋関数のみを置く（環境変数未設定でもテスト可能）。

export const EMAIL_FORMAT_MESSAGE = 'メールアドレスの形式が正しくありません';
export const PASSWORD_LENGTH_MESSAGE = 'パスワードは8文字以上で入力してください';
export const DUPLICATE_EMAIL_MESSAGE = 'このメールアドレスは既に登録されています';
export const LOGIN_FAILURE_MESSAGE = 'メールアドレスまたはパスワードが正しくありません';
export const REGISTER_FAILURE_MESSAGE = '登録に失敗しました。もう一度お試しください。';
// issue #116: Supabase Authのパスワード上限（72バイト）に伴い追加
export const PASSWORD_TOO_LONG_MESSAGE =
	'パスワードが長すぎます（半角英数字で72文字以内にしてください）';
// issue #116: Supabase Authの回数制限（IP単位）に当たったとき用
export const RATE_LIMIT_MESSAGE =
	'試行回数が多すぎます。しばらく時間をおいてからもう一度お試しください。';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

// ブラウザのtype="email"ネイティブ検証（WHATWG living standard準拠）と同等の厳格度に揃える。
// `<`や`'`等の記号を許容してしまう緩いパターン（`[^\s@]+`）だと、Supabaseに渡す前に
// 弾くべき入力（`a<b@x.com`等）が通ってしまうため厳格化している。
const EMAIL_PATTERN =
	/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const MAX_EMAIL_LENGTH = 255;

/**
 * メールアドレスをtrim + 小文字化して正規化する。
 * Supabaseに渡す前に必ずこの正規化後の値を使う（大文字違いの重複登録を防ぐため）。
 */
export function normalizeEmail(rawEmail: string): string {
	return rawEmail.trim().toLowerCase();
}

/**
 * 登録時のメール形式を事前チェックする（Supabase未到達の簡易パターン）。
 * Supabase Auth自身の検証（validation_failed、英語メッセージ）に到達する前に弾くことで、
 * 既存と同一の日本語メッセージを確実に返す。
 */
export function isValidEmailFormat(email: string): boolean {
	return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

/**
 * 表示名（user_metadata.name）をメールのローカル部から機械的に生成する。
 * UIに名前入力欄は追加しない方針への対応。
 */
export function deriveNameFromEmail(email: string): string {
	const localPart = email.split('@')[0];
	return localPart && localPart.length > 0 ? localPart : email;
}

/**
 * パスワード長の事前検査（Supabaseに送る前）。8文字未満、またはUTF-8で72バイト超ならメッセージを返す。
 * 8文字の判定は文字数（ブラウザのminlengthと同じUTF-16単位）、上限はバイト数で行う。
 */
export function checkPasswordLength(password: string): string | null {
	if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_LENGTH_MESSAGE;
	if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
		return PASSWORD_TOO_LONG_MESSAGE;
	}
	return null;
}

/**
 * 登録（signUp）失敗時のSupabase Authエラーコードを日本語メッセージへ変換する。
 * 未知のコード・signup_disabled等はnullを返す（呼び出し側で汎用メッセージにフォールバックする）。
 */
export function mapSignUpErrorCode(code: string | undefined): string | null {
	switch (code) {
		case 'user_already_exists':
		case 'email_exists':
			return DUPLICATE_EMAIL_MESSAGE;
		case 'weak_password':
			return PASSWORD_LENGTH_MESSAGE;
		case 'email_address_invalid':
		case 'validation_failed':
			return EMAIL_FORMAT_MESSAGE;
		case 'over_request_rate_limit':
		case 'over_email_send_rate_limit':
			return RATE_LIMIT_MESSAGE;
		default:
			return null;
	}
}

/**
 * ログイン（signInWithPassword）失敗時のメッセージ。回数制限だけ別メッセージにし、
 * それ以外（invalid_credentials・email_not_confirmed・未知のコード・Supabase以外の例外）は
 * アカウントの存在を推測させないよう統一メッセージにする。
 */
export function mapSignInErrorCode(code: string | undefined): string {
	return code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit'
		? RATE_LIMIT_MESSAGE
		: LOGIN_FAILURE_MESSAGE;
}
