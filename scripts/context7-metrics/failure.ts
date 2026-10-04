/**
 * Context7 の障害文言（先頭 300 文字だけを見る。成功したドキュメント本文中の語を拾わないため）。
 * 拡張するときは docs/context7-measurement.md の一覧も更新する。いずれも短い句のみ。
 */
export const FAILURE_PATTERNS: { category: string; pattern: RegExp }[] = [
	{
		category: 'キー失効・認証エラー',
		pattern: /Invalid API key|Unauthorized|authentication failed/i
	},
	{ category: 'レート制限', pattern: /rate limit|too many requests/i },
	{
		category: '接続失敗',
		pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|connection (refused|failed)/i
	}
];

const HEAD_LENGTH = 300;

/** tool_result から障害区分を返す。障害でなければ null。本文は返さない。 */
export function classifyFailure(result: { isError: boolean; head: string }): string | null {
	const head = result.head.slice(0, HEAD_LENGTH);
	for (const { category, pattern } of FAILURE_PATTERNS) {
		if (pattern.test(head)) return category;
	}
	return result.isError ? 'その他' : null;
}
