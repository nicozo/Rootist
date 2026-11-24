// issue #116: Supabase Authのエラーをログ用に要約し、想定外かを判定する。
// DBアクセス・Supabaseクライアント初期化を一切行わない純粋関数のみを置く（環境変数未設定でもテスト可能）。

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
