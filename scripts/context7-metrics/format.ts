import type { IssueRow, Report } from './aggregate.ts';

const NONE = '—';

/** 所要時間を `21h09m47.661s` の形にする。 */
export function formatDuration(ms: number | null): string {
	if (ms === null) return NONE;
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = (ms % 60_000) / 1000;
	const sec = s.toFixed(3).padStart(6, '0');
	if (h > 0) return `${h}h${String(m).padStart(2, '0')}m${sec}s`;
	if (m > 0) return `${m}m${sec}s`;
	return `${s.toFixed(3)}s`;
}

/** Markdown の表セルに入れられるよう、パイプと改行を潰す。 */
function cell(v: string | number): string {
	return String(v)
		.replace(/\|/g, '/')
		.replace(/\s*\n\s*/g, ' ');
}

function table(headers: string[], rows: (string | number)[][]): string {
	const head = `| ${headers.join(' | ')} |`;
	const sep = `| ${headers.map(() => '---').join(' | ')} |`;
	const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`);
	return [
		head,
		sep,
		...(body.length
			? body
			: [`| ${headers.map((_, i) => (i === 0 ? '（該当なし）' : '')).join(' | ')} |`])
	].join('\n');
}

export const ISSUE_HEADERS = [
	'issue',
	'導入前後',
	'期間(UTC)',
	'resolve',
	'query-docs',
	'対象ライブラリ',
	'障害',
	'generator 呼び出し',
	'QA イテレーション',
	'FAIL',
	'使用記録の有無',
	'申告との不一致',
	'generator トークン',
	'所要時間'
];

/** 台帳と出力で同じ文字列になるよう、issue 行の組み立てはここだけで行う。 */
export function issueCells(r: IssueRow): (string | number)[] {
	return [
		r.label,
		r.phase,
		r.period,
		r.resolve,
		r.query,
		r.libraries.length ? r.libraries.join(', ') : NONE,
		r.failures,
		r.generatorCalls,
		r.qaIterations,
		r.qaFails,
		r.usageRecord,
		r.mismatch,
		r.generatorTokens === null ? NONE : r.generatorTokens,
		formatDuration(r.durationMs)
	];
}

export function formatMarkdown(report: Report, withCalls = false): string {
	const parts: string[] = [];
	parts.push(`# Context7 計測結果`);
	parts.push(
		`導入前/後の境界（UTC）: ${report.boundary}（PR #100 の merged_at）。「issue 不明」「ベンチ」の行は導入前後を判定しない（${NONE}）。`
	);
	parts.push('## issue 別');
	parts.push(table(ISSUE_HEADERS, report.issues.map(issueCells)));
	parts.push('## ライブラリ別');
	parts.push(
		table(
			['ライブラリ', 'resolve', 'query-docs', 'issue'],
			report.libraries.map((l) => [l.library, l.resolve, l.query, l.issues.join(', ')])
		)
	);
	parts.push('## エージェント別（Svelte MCP は参考値。評価判断には使わない）');
	parts.push(
		table(
			['issue', 'エージェント', 'Context7 呼び出し', 'Svelte MCP 呼び出し'],
			report.agents.map((a) => [a.issue, a.agent, a.context7, a.svelte])
		)
	);
	if (report.workspaces.length) {
		parts.push('## ワークスペース別の使用記録');
		parts.push(
			table(
				['ワークスペース', 'issue', '使用記録の有無', '申告', '実績（全エージェント）', '突合'],
				report.workspaces.map((w) => [
					w.workspace,
					w.issue,
					w.usageRecord,
					w.claimsUse,
					w.actualCalls ?? NONE,
					w.verdict
				])
			)
		);
	}
	if (withCalls) {
		parts.push('## 呼び出し一覧（クエリは先頭のみ）');
		parts.push(
			table(
				['issue', 'エージェント', 'ツール', 'ライブラリ', 'クエリ（要約）', '障害'],
				report.calls.map((c) => [c.issue, c.agent, c.tool, c.library, c.query, c.failure ?? NONE])
			)
		);
	}
	parts.push('## 警告');
	parts.push(report.warnings.length ? report.warnings.map((w) => `- ${w}`).join('\n') : '- なし');
	return parts.join('\n\n') + '\n';
}

export function formatJson(report: Report): string {
	return JSON.stringify(report, null, 2) + '\n';
}
