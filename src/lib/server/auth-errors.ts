// issue #116: Supabase Authのエラー（英語コード）をUIにそのまま見せないための日本語メッセージ変換。
// DBアクセス・Supabaseクライアント初期化を一切行わない純粋関数のみを置く（環境変数未設定でもテスト可能）。

export const EMAIL_FORMAT_MESSAGE = 'メールアドレスの形式が正しくありません';
// issue #189: メールのコード（OTP）での登録・ログイン用
export const CODE_INVALID_MESSAGE =
	'コードが正しくないか、期限が切れています。入力し直すか、コードを再送してください。';
export const RESEND_WAIT_MESSAGE = 'コードを送ったばかりです。60秒ほど待ってから再送してください。';
export const SEND_FAILURE_MESSAGE = 'コードを送れませんでした。もう一度お試しください。';
// issue #116: Supabase Authの回数制限（IP単位）に当たったとき用
export const RATE_LIMIT_MESSAGE =
	'試行回数が多すぎます。しばらく時間をおいてからもう一度お試しください。';

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
 * コード送信（signInWithOtp）失敗時のSupabase Authエラーコードを日本語メッセージへ変換する。
 * 再送の間隔（FR-009）・回数制限（FR-023）・形式（FR-011）以外は送信失敗（FR-025）にする。
 */
export function mapSendCodeErrorCode(code: string | undefined): string {
	switch (code) {
		case 'email_address_invalid':
		case 'validation_failed':
			return EMAIL_FORMAT_MESSAGE;
		case 'over_email_send_rate_limit':
			return RESEND_WAIT_MESSAGE;
		case 'over_request_rate_limit':
			return RATE_LIMIT_MESSAGE;
		default:
			return SEND_FAILURE_MESSAGE;
	}
}

/**
 * コード確認（verifyOtp）失敗時のメッセージ。回数制限だけ別メッセージにし、誤り・期限切れ・
 * 未知のコードは同じ「コードが正しくないか期限切れ」にする（FR-008, FR-022, FR-023）。
 */
export function mapVerifyCodeErrorCode(code: string | undefined): string {
	return code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit'
		? RATE_LIMIT_MESSAGE
		: CODE_INVALID_MESSAGE;
}

/** ログに出してよい、Supabase Authエラーの種別情報（値・トークン・パスワードは含めない） */
export type AuthErrorLike = { name?: string; code?: string; status?: number };

export function describeAuthError(error: AuthErrorLike): {
	name: string | undefined;
	code: string | undefined;
	status: number | undefined;
} {
	return { name: error.name, code: error.code, status: error.status };
}

/**
 * サーバーログに残すべき「想定外」のSupabase Authエラーか。
 * supabase-jsはネットワーク障害（AuthRetryableFetchError）や429を例外ではなく戻り値のerrorで返すため、
 * 呼び出し側で明示的に判定してログに残す。セッション無し・無効（通常の未ログイン）は想定内として除く。
 */
export function isUnexpectedAuthError(error: AuthErrorLike): boolean {
	if (error.name === 'AuthSessionMissingError') return false;
	if (error.name === 'AuthRetryableFetchError') return true;
	if (error.status === 429 || error.code === 'over_request_rate_limit') return true;
	if (error.code === 'over_email_send_rate_limit') return true;
	if (typeof error.status === 'number' && (error.status === 0 || error.status >= 500)) return true;
	return false;
}
