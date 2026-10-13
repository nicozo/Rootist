export type Verdict = 'PASS' | 'FAIL' | '判定不能';

/** Markdown の装飾（`*` `_` `` ` ``）を外す。 */
function stripMarkdown(s: string): string {
	return s.replace(/[*_`]/g, '').trim();
}

/**
 * QA レポート本文から総合判定を読む。
 * `## 総合判定: **FAIL**（MEDIUM 1 件…）` のような装飾・補足付きも読める。
 * `PASS / FAIL` のような書式見本、判定行が無い場合は「判定不能」。
 */
export function parseVerdict(markdown: string): Verdict {
	const lines = markdown.split(/\r?\n/);
	// 見出し形式（# 総合判定）を優先し、無ければ最初の「総合判定:」行を使う
	const line =
		lines.find((l) => /^#+\s*総合判定/.test(l)) ?? lines.find((l) => /総合判定\s*[:：]/.test(l));
	if (!line) return '判定不能';
	const m = /総合判定\s*[:：]?\s*(.*)$/.exec(line);
	if (!m) return '判定不能';
	const value = stripMarkdown(m[1]);
	if (/^(PASS|FAIL)\s*\/\s*(PASS|FAIL)/i.test(value)) return '判定不能';
	if (/^FAIL\b/i.test(value)) return 'FAIL';
	if (/^PASS\b/i.test(value)) return 'PASS';
	return '判定不能';
}
