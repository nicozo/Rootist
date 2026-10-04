/**
 * Context7 の障害文言。障害の本文は短い（先頭から始まる 1〜2 文）ので、次の 2 つで成功した本文の誤検知を避ける。
 * - 行頭一致（成功したドキュメントの見出しや本文中の語を拾わない）
 * - `is_error` が無いときは、本文全体が短いもの（HEAD_LENGTH 未満）だけを対象にする
 * 拡張するときは docs/context7-measurement.md の一覧も更新する。いずれも短い句のみ。
 */
export const FAILURE_PATTERNS: { category: string; pattern: RegExp }[] = [
	{
		category: 'キー失効・認証エラー',
		pattern: /^\s*(?:error:?\s*)?(?:Invalid API key|Unauthorized|authentication failed)/i
	},
	{
		category: 'レート制限',
		pattern: /^\s*(?:error:?\s*)?(?:Rate limit(?:ed| exceeded)|Too many requests)/i
	},
	{
		category: '接続失敗',
		pattern:
			/^\s*(?:error:?\s*)?(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|connection (?:refused|failed))/i
	}
];

/** extract.ts が保持する tool_result 本文の先頭の長さ。これ未満なら本文全体が短いとみなす。 */
export const HEAD_LENGTH = 400;

/** tool_result から障害区分を返す。障害でなければ null。本文は返さない。 */
export function classifyFailure(result: { isError: boolean; head: string }): string | null {
	// 長い本文は成功したドキュメントとみなす（`is_error` が付いているものは別）
	const candidate = result.isError || result.head.length < HEAD_LENGTH;
	if (candidate) {
		for (const { category, pattern } of FAILURE_PATTERNS) {
			if (pattern.test(result.head)) return category;
		}
	}
	return result.isError ? 'その他' : null;
}
