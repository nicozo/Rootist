/**
 * Places API (New) のセッショントークン（issue #149）。
 *
 * 候補検索（Autocomplete）を同じトークンで続け、最後に Place Details を同じトークンで呼ぶと、
 * そのセッション内の Autocomplete リクエストは課金されず Place Details の1回分だけになる。
 * トークンはクライアントが場所を1件選ぶたびに作り直す。
 */
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,36}$/;

export function isSessionToken(value: unknown): value is string {
	return typeof value === 'string' && SESSION_TOKEN_PATTERN.test(value);
}

/** URL パスに埋め込むため、Places の place ID として妥当な文字だけを許可する */
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

export function isPlaceId(value: unknown): value is string {
	return typeof value === 'string' && PLACE_ID_PATTERN.test(value);
}
