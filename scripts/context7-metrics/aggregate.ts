import { issueFromBranch, linkWorkspaceToIssue } from './branch.ts';
import { mergeUsage, totalTokens } from './extract.ts';
import { parseSelfEvaluation } from './self-eval.ts';
import type { Facts, IssueKey, Usage } from './types.ts';

/** Context7 導入（PR #100 の merged_at, UTC）。確認元: https://api.github.com/repos/nicozo/Rootist/pulls/100 */
export const CONTEXT7_INTRODUCED_AT = '2026-10-03T07:29:49Z';

export const LEGACY_LABEL = '不明（旧形式）';
const NONE = '—';

/** `--dev-loop` から得たワークスペースの情報（読み取りは注入。この関数自体は I/O をしない）。 */
export interface DevLoopInfo {
	/** `.dev-loop/` 直下のディレクトリ名（`<YYYYMMDD>-<slug>`）。 */
	workspaces: string[];
	/** `<ws>/self_evaluation.md` の本文。ファイルが無ければ null。 */
	readSelfEvaluation(ws: string): string | null;
}

export interface AggregateOptions {
	issue?: number;
	devLoop?: DevLoopInfo;
	/** 導入前/後の境界（既定は CONTEXT7_INTRODUCED_AT）。 */
	boundary?: string;
}

export type UsageRecordStatus = '節あり' | '節なし' | 'ファイル無し' | '紐付け不能' | '未指定';

export interface IssueRow {
	label: string;
	period: string;
	phase: '導入前' | '導入後' | '—';
	resolve: number;
	query: number;
	libraries: string[];
	failures: number;
	generatorCalls: number;
	qaIterations: string;
	qaFails: string;
	usageRecord: UsageRecordStatus;
	mismatch: 'あり' | 'なし' | '—';
	generatorTokens: number | null;
	durationMs: number | null;
	/** 台帳・JSON 用の補足（旧形式の QA 書き込み回数など）。 */
	legacyQaWrites: number;
}

export interface LibraryRow {
	library: string;
	resolve: number;
	query: number;
	issues: string[];
}

export interface AgentRow {
	issue: string;
	agent: string;
	context7: number;
	svelte: number;
}

export interface WorkspaceRow {
	workspace: string;
	issue: string;
	usageRecord: UsageRecordStatus;
	claimsUse: '申告あり' | '申告なし' | '—';
	actualCalls: number | null;
	verdict: '一致' | '不一致' | '使用記録なし' | '—';
}

export interface CallRow {
	issue: string;
	agent: string;
	tool: 'resolve-library-id' | 'query-docs';
	library: string;
	query: string;
	failure: string | null;
}

export interface Report {
	boundary: string;
	issues: IssueRow[];
	libraries: LibraryRow[];
	agents: AgentRow[];
	workspaces: WorkspaceRow[];
	calls: CallRow[];
	warnings: string[];
}

interface Acc {
	key: IssueKey;
	first: number;
	last: number;
	firstIso: string;
	lastIso: string;
	resolve: number;
	query: number;
	libs: Set<string>;
	failures: number;
	byAgent: Map<string, { c7: number; svelte: number }>;
	tokens: Usage[] | null;
	genSpans: Map<string, { min: number; max: number }>;
	qaIters: Map<string, 'PASS' | 'FAIL' | '判定不能'>;
	qaMaxIter: number;
	legacyWrites: number;
}

function keyString(k: IssueKey): string {
	switch (k.kind) {
		case 'issue':
			return `issue:${k.n}`;
		default:
			return k.kind;
	}
}

export function keyLabel(k: IssueKey): string {
	switch (k.kind) {
		case 'issue':
			return String(k.n);
		case 'unknown':
			return 'issue 不明';
		case 'unverified':
			return 'issue 不明（要確認）';
		case 'bench':
			return 'ベンチ';
	}
}

function keyOrder(k: IssueKey): number {
	switch (k.kind) {
		case 'issue':
			return k.n;
		case 'unknown':
			return 1e9;
		case 'unverified':
			return 1e9 + 1;
		case 'bench':
			return 1e9 + 2;
	}
}

function newAcc(key: IssueKey): Acc {
	return {
		key,
		first: Infinity,
		last: -Infinity,
		firstIso: '',
		lastIso: '',
		resolve: 0,
		query: 0,
		libs: new Set(),
		failures: 0,
		byAgent: new Map(),
		tokens: null,
		genSpans: new Map(),
		qaIters: new Map(),
		qaMaxIter: 0,
		legacyWrites: 0
	};
}

function getAcc(map: Map<string, Acc>, key: IssueKey): Acc {
	const s = keyString(key);
	let a = map.get(s);
	if (!a) {
		a = newAcc(key);
		map.set(s, a);
	}
	return a;
}

function agentCell(acc: Acc, agent: string) {
	let c = acc.byAgent.get(agent);
	if (!c) {
		c = { c7: 0, svelte: 0 };
		acc.byAgent.set(agent, c);
	}
	return c;
}

const PRIORITY: UsageRecordStatus[] = ['節あり', '節なし', 'ファイル無し', '紐付け不能'];

/** 集計の本体（純粋関数）。重複排除・issue 紐付け・申告との突合を行う。 */
export function aggregate(facts: Facts, opts: AggregateOptions = {}): Report {
	const warnings: string[] = [];
	const accs = new Map<string, Acc>();
	const boundaryMs = Date.parse(opts.boundary ?? CONTEXT7_INTRODUCED_AT);

	// 行ごとの時刻 → 期間・導入前後・generator の所要時間（ファイルごとの最小値〜最大値）
	for (const s of facts.stamps) {
		const ms = Date.parse(s.ts);
		if (Number.isNaN(ms)) continue;
		const acc = getAcc(accs, issueFromBranch(s.branch));
		if (ms < acc.first) {
			acc.first = ms;
			acc.firstIso = s.ts;
		}
		if (ms > acc.last) {
			acc.last = ms;
			acc.lastIso = s.ts;
		}
		if (s.agent === 'generator') {
			const span = acc.genSpans.get(s.file);
			if (!span) acc.genSpans.set(s.file, { min: ms, max: ms });
			else {
				span.min = Math.min(span.min, ms);
				span.max = Math.max(span.max, ms);
			}
		}
	}

	// 障害: tool_use_id ごとに最初に見つかった障害区分
	const failureById = new Map<string, string>();
	for (const r of facts.results) {
		if (r.failure && !failureById.has(r.toolUseId)) failureById.set(r.toolUseId, r.failure);
	}

	// Context7 呼び出し（tool_use id で重複排除）
	const seenCalls = new Set<string>();
	const calls: (CallRow & { issueKey: string })[] = [];
	for (const c of facts.calls) {
		if (seenCalls.has(c.id)) continue;
		seenCalls.add(c.id);
		const key = issueFromBranch(c.branch);
		const acc = getAcc(accs, key);
		const failure = failureById.get(c.id) ?? null;
		if (c.kind === 'resolve') acc.resolve++;
		else acc.query++;
		acc.libs.add(c.library);
		if (failure) acc.failures++;
		agentCell(acc, c.agent).c7++;
		calls.push({
			issueKey: keyString(key),
			issue: keyLabel(key),
			agent: c.agent,
			tool: c.kind === 'resolve' ? 'resolve-library-id' : 'query-docs',
			library: c.library,
			query: c.query,
			failure
		});
	}
	const seenSvelte = new Set<string>();
	for (const c of facts.svelteCalls) {
		if (seenSvelte.has(c.id)) continue;
		seenSvelte.add(c.id);
		agentCell(getAcc(accs, issueFromBranch(c.branch)), c.agent).svelte++;
	}

	// トークン: メッセージ ID で重複排除（フィールドごとの最大値）。generator のみ issue に計上
	const usageById = new Map<string, { usage: Usage; branch: string; agent: string }>();
	for (const u of facts.usages) {
		const prev = usageById.get(u.messageId);
		if (!prev) usageById.set(u.messageId, { usage: u.tokens, branch: u.branch, agent: u.agent });
		else prev.usage = mergeUsage(prev.usage, u.tokens);
	}
	for (const { usage, branch, agent } of usageById.values()) {
		if (agent !== 'generator') continue;
		const acc = getAcc(accs, issueFromBranch(branch));
		(acc.tokens ??= []).push(usage);
	}

	// ワークスペースの紐付け（Write / Edit / Read のいずれでも。スラッグ完全一致のみ）
	const wsIssues = new Map<string, Set<number>>();
	const wsMismatch = new Map<string, { count: number; branches: Set<string> }>();
	for (const op of facts.workspaceOps) {
		const n = linkWorkspaceToIssue(op.slug, op.branch);
		if (n !== null) {
			let set = wsIssues.get(op.ws);
			if (!set) wsIssues.set(op.ws, (set = new Set()));
			set.add(n);
		} else {
			let m = wsMismatch.get(op.ws);
			if (!m) wsMismatch.set(op.ws, (m = { count: 0, branches: new Set() }));
			m.count++;
			m.branches.add(op.branch || '(ブランチ不明)');
		}
	}
	for (const [ws, m] of [...wsMismatch].sort(([a], [b]) => a.localeCompare(b))) {
		warnings.push(
			`スラッグ不一致: ワークスペース ${ws} を、スラッグの合わない/issue 番号の無いブランチ（${[...m.branches].sort().join(', ')}）から ${m.count} 件参照。紐付けから除外した`
		);
	}
	for (const [ws, set] of wsIssues) {
		if (set.size > 1) {
			warnings.push(
				`ワークスペース ${ws} が複数の issue（${[...set].sort((a, b) => a - b).join(', ')}）に紐付いた。紐付け不能として扱う`
			);
		}
	}

	// QA レポート
	const latest = new Map<string, (typeof facts.qaWrites)[number]>();
	const seenQa = new Set<string>();
	for (const w of facts.qaWrites) {
		if (seenQa.has(w.toolUseId)) continue;
		seenQa.add(w.toolUseId);
		const issue = linkWorkspaceToIssue(w.slug, w.branch);
		const acc = getAcc(accs, issue === null ? { kind: 'unverified' } : { kind: 'issue', n: issue });
		if (w.iter === null) {
			acc.legacyWrites++;
			continue;
		}
		const k = `${w.ws}#${w.iter}#${issue ?? 'x'}`;
		const prev = latest.get(k);
		if (!prev || w.ts > prev.ts || (w.ts === prev.ts && w.seq > prev.seq)) latest.set(k, w);
	}
	for (const [k, w] of latest) {
		const issue = linkWorkspaceToIssue(w.slug, w.branch);
		const acc = getAcc(accs, issue === null ? { kind: 'unverified' } : { kind: 'issue', n: issue });
		acc.qaIters.set(k, w.verdict);
		acc.qaMaxIter = Math.max(acc.qaMaxIter, w.iter ?? 0);
		if (w.verdict === '判定不能')
			warnings.push(`QA 総合判定を読めなかった: ${w.ws} の qa_report_iter${w.iter}.md`);
	}
	for (const acc of accs.values()) {
		if (acc.legacyWrites > 0 && acc.key.kind === 'issue') {
			warnings.push(
				`旧形式の qa_report.md（iter 番号なし）: issue ${acc.key.n} のイテレーション数・FAIL 回数は ${LEGACY_LABEL}（書き込み ${acc.legacyWrites} 回は参考値）`
			);
		}
	}

	// 申告との突合
	const issueTotals = (n: number) => {
		const a = accs.get(keyString({ kind: 'issue', n }));
		return a ? a.resolve + a.query : 0;
	};
	const workspaces: WorkspaceRow[] = [];
	const wsByIssue = new Map<number, UsageRecordStatus[]>();
	const mismatchByIssue = new Map<number, boolean>();
	const pushStatus = (n: number, status: UsageRecordStatus) => {
		const list = wsByIssue.get(n) ?? [];
		list.push(status);
		wsByIssue.set(n, list);
	};
	const dev = opts.devLoop;
	if (dev) {
		const universe = new Set<string>([...dev.workspaces, ...[...wsIssues.keys()]]);
		for (const ws of [...universe].sort()) {
			const set = wsIssues.get(ws);
			if (!set || set.size !== 1) {
				workspaces.push({
					workspace: ws,
					issue: NONE,
					usageRecord: '紐付け不能',
					claimsUse: NONE,
					actualCalls: null,
					verdict: NONE
				});
				continue;
			}
			const n = [...set][0];
			const text = dev.workspaces.includes(ws) ? dev.readSelfEvaluation(ws) : null;
			if (text === null) {
				workspaces.push({
					workspace: ws,
					issue: String(n),
					usageRecord: 'ファイル無し',
					claimsUse: NONE,
					actualCalls: null,
					verdict: NONE
				});
				pushStatus(n, 'ファイル無し');
				continue;
			}
			const se = parseSelfEvaluation(text);
			const actual = issueTotals(n);
			let row: WorkspaceRow;
			if (se.hasSection) {
				const claims = se.usedRows > 0;
				const consistent = claims === actual > 0;
				row = {
					workspace: ws,
					issue: String(n),
					usageRecord: '節あり',
					claimsUse: claims ? '申告あり' : '申告なし',
					actualCalls: actual,
					verdict: consistent ? '一致' : '不一致'
				};
				mismatchByIssue.set(n, (mismatchByIssue.get(n) ?? false) || !consistent);
				if (!consistent) {
					warnings.push(
						`申告との不一致: ワークスペース ${ws}（issue ${n}）は ${claims ? '使用あり' : '使用なし'}と申告しているが、実績の Context7 呼び出しは ${actual} 件`
					);
				}
			} else {
				row = {
					workspace: ws,
					issue: String(n),
					usageRecord: '節なし',
					claimsUse: NONE,
					actualCalls: actual,
					verdict: actual > 0 ? '使用記録なし' : NONE
				};
				if (actual > 0) {
					warnings.push(
						`使用記録なし: ワークスペース ${ws}（issue ${n}）は Context7 の実績 ${actual} 件があるが、self_evaluation.md に使用記録の節が無い`
					);
				}
			}
			workspaces.push(row);
			pushStatus(n, row.usageRecord);
		}
		const missing = workspaces
			.filter((w) => w.usageRecord === 'ファイル無し')
			.map((w) => w.workspace);
		if (missing.length)
			warnings.push(
				`使用記録: self_evaluation.md が現存しない（紐付け済み）ワークスペース: ${missing.join(', ')}`
			);
		const unlinked = workspaces
			.filter((w) => w.usageRecord === '紐付け不能')
			.map((w) => w.workspace);
		if (unlinked.length)
			warnings.push(`使用記録: issue に紐付けできないワークスペース: ${unlinked.join(', ')}`);
	}

	// 行の組み立て
	const rows: IssueRow[] = [];
	for (const acc of [...accs.values()].sort((a, b) => keyOrder(a.key) - keyOrder(b.key))) {
		const isIssue = acc.key.kind === 'issue';
		const n = acc.key.kind === 'issue' ? acc.key.n : -1;
		const verdicts = [...acc.qaIters.values()];
		const hasIter = verdicts.length > 0;
		const spans = [...acc.genSpans.values()];
		let usageRecord: UsageRecordStatus = '未指定';
		if (dev && isIssue) {
			const list = wsByIssue.get(n) ?? [];
			usageRecord = PRIORITY.find((p) => list.includes(p)) ?? '紐付け不能';
		} else if (dev) usageRecord = '紐付け不能';
		rows.push({
			label: keyLabel(acc.key),
			period: periodLabel(acc.firstIso, acc.lastIso),
			phase:
				isIssue && acc.first !== Infinity ? (acc.first < boundaryMs ? '導入前' : '導入後') : '—',
			resolve: acc.resolve,
			query: acc.query,
			libraries: [...acc.libs].sort(),
			failures: acc.failures,
			generatorCalls: acc.byAgent.get('generator')?.c7 ?? 0,
			qaIterations: hasIter ? String(acc.qaMaxIter) : acc.legacyWrites > 0 ? LEGACY_LABEL : NONE,
			qaFails: hasIter
				? String(verdicts.filter((v) => v === 'FAIL').length)
				: acc.legacyWrites > 0
					? LEGACY_LABEL
					: NONE,
			usageRecord,
			mismatch:
				isIssue && mismatchByIssue.has(n) ? (mismatchByIssue.get(n) ? 'あり' : 'なし') : '—',
			generatorTokens: acc.tokens ? acc.tokens.reduce((s, u) => s + totalTokens(u), 0) : null,
			durationMs: spans.length ? spans.reduce((s, x) => s + (x.max - x.min), 0) : null,
			legacyQaWrites: acc.legacyWrites
		});
	}

	if (facts.badLines > 0)
		warnings.push(`読めない行（JSON 不正・途切れ）を ${facts.badLines} 行スキップした`);
	if (facts.metaMissing > 0)
		warnings.push(
			`meta.json が無い/読めないサブエージェント記録が ${facts.metaMissing} 件あり、agentType を unknown として扱った`
		);

	// 絞り込み（issue 指定）。ワークスペースの紐付けは全体で行った上で、出力だけを絞る
	const only = opts.issue;
	const keep = (label: string) => only === undefined || label === String(only);
	const outCalls = calls.filter((c) => keep(c.issue));
	const libs = new Map<string, LibraryRow>();
	for (const c of outCalls) {
		let l = libs.get(c.library);
		if (!l) libs.set(c.library, (l = { library: c.library, resolve: 0, query: 0, issues: [] }));
		if (c.tool === 'resolve-library-id') l.resolve++;
		else l.query++;
		if (!l.issues.includes(c.issue)) l.issues.push(c.issue);
	}
	const agents: AgentRow[] = [];
	for (const acc of [...accs.values()].sort((a, b) => keyOrder(a.key) - keyOrder(b.key))) {
		if (!keep(keyLabel(acc.key))) continue;
		for (const [agent, c] of [...acc.byAgent].sort(([a], [b]) => a.localeCompare(b))) {
			agents.push({ issue: keyLabel(acc.key), agent, context7: c.c7, svelte: c.svelte });
		}
	}
	return {
		boundary: opts.boundary ?? CONTEXT7_INTRODUCED_AT,
		issues: rows.filter((r) => keep(r.label)),
		libraries: [...libs.values()].sort((a, b) => a.library.localeCompare(b.library)),
		agents,
		workspaces:
			only === undefined ? workspaces : workspaces.filter((w) => w.issue === String(only)),
		calls: outCalls.map((c) => ({
			issue: c.issue,
			agent: c.agent,
			tool: c.tool,
			library: c.library,
			query: c.query,
			failure: c.failure
		})),
		warnings
	};
}

function periodLabel(first: string, last: string): string {
	if (!first) return NONE;
	const a = first.slice(0, 10);
	const b = last.slice(0, 10);
	return a === b ? a : `${a}〜${b}`;
}
