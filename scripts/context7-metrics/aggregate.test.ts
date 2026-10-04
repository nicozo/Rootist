import { describe, expect, it } from 'vite-plus/test';
import {
	aggregate,
	CONTEXT7_INTRODUCED_AT,
	LEGACY_LABEL,
	type DevLoopInfo,
	type Report
} from './aggregate.ts';
import { extractFacts, mergeFacts } from './facts.ts';
import { formatDuration, formatJson, formatMarkdown } from './format.ts';
import type { RawRecord, Source } from './types.ts';
import {
	assistantText,
	editFile,
	qaReport,
	queryCall,
	QUERY,
	readFile,
	resolveCall,
	RESOLVE,
	source,
	toolResult,
	toolListing,
	toolUse,
	userText,
	writeFile
} from './fixtures/builders.ts';

type Input = { source: Source; records: RawRecord[]; badLines?: number };

function build(inputs: Input[], devLoop?: DevLoopInfo, issue?: number): Report {
	const facts = mergeFacts(inputs.map((i) => extractFacts(i.records, i.source, i.badLines ?? 0)));
	return aggregate(facts, { devLoop, issue });
}

function row(report: Report, label: string) {
	const r = report.issues.find((x) => x.label === label);
	if (!r) throw new Error(`行が無い: ${label}`);
	return r;
}

function devLoop(files: Record<string, string | null>): DevLoopInfo {
	return {
		workspaces: Object.keys(files),
		readSelfEvaluation: (ws) => files[ws] ?? null
	};
}

const B116 = 'feat/issue-116-supabase-email-password-auth';
const WS116 = '/r/.dev-loop/20261003-supabase-email-password-auth';

describe('Context7 呼び出しの計数', () => {
	it('T-1: ツール定義一覧・テキスト・プロンプト・tool_result 内のツール名への言及は 0 件', () => {
		const report = build([
			{
				source: source('generator'),
				records: [
					toolListing({ branch: B116 }),
					assistantText({ branch: B116, text: `${RESOLVE} と ${QUERY} を使う予定` }),
					userText({ branch: B116, text: `依頼文: ${QUERY} ${RESOLVE}` }),
					toolResult({ branch: B116, toolUseId: 'x', text: `結果に ${QUERY} が含まれる` })
				]
			}
		]);
		const r = row(report, '116');
		expect(r.resolve).toBe(0);
		expect(r.query).toBe(0);
		expect(r.generatorCalls).toBe(0);
	});

	it('T-2: 同一 tool_use id が複数行に出ても 1 件', () => {
		const call = resolveCall({ id: 't1', branch: B116 });
		const report = build([
			{ source: source('generator'), records: [call, call, queryCall({ id: 't2', branch: B116 })] }
		]);
		const r = row(report, '116');
		expect(r.resolve).toBe(1);
		expect(r.query).toBe(1);
	});

	it('T-12: 同じ接頭辞の別ツール（mcp-find / getPersonalNamespace）は 0 件', () => {
		const report = build([
			{
				source: source('main'),
				records: [
					toolUse({ id: 'a', name: 'mcp__MCP_DOCKER__mcp-find', branch: 'main' }),
					toolUse({ id: 'b', name: 'mcp__MCP_DOCKER__getPersonalNamespace', branch: 'main' }),
					toolUse({ id: 'c', name: 'mcp__MCP_DOCKER__query-docs-extra', branch: 'main' })
				]
			}
		]);
		const r = row(report, 'issue 不明');
		expect(r.resolve + r.query).toBe(0);
		expect(report.libraries).toEqual([]);
	});

	it('T-3: サブエージェントは agentType（meta.json 由来）で分類される', () => {
		const report = build([
			{
				source: source('generator', '/s/g.jsonl'),
				records: [resolveCall({ id: 'g1', branch: B116 }), queryCall({ id: 'g2', branch: B116 })]
			},
			{ source: source('planner', '/s/p.jsonl'), records: [queryCall({ id: 'p1', branch: B116 })] },
			{ source: source('main', '/s/m.jsonl'), records: [queryCall({ id: 'm1', branch: B116 })] }
		]);
		expect(report.agents.filter((a) => a.issue === '116')).toEqual([
			{ issue: '116', agent: 'generator', context7: 2, svelte: 0 },
			{ issue: '116', agent: 'main', context7: 1, svelte: 0 },
			{ issue: '116', agent: 'planner', context7: 1, svelte: 0 }
		]);
		expect(row(report, '116').generatorCalls).toBe(2);
	});

	it('T-4: 1 セッション内でブランチが main から issue ブランチに変わっても行単位で振り分ける', () => {
		const report = build([
			{
				source: source('main'),
				records: [
					resolveCall({ id: 'a', branch: 'main', ts: '2026-10-03T09:00:00.000Z' }),
					queryCall({ id: 'b', branch: B116, ts: '2026-10-03T10:00:00.000Z' })
				]
			}
		]);
		expect(row(report, 'issue 不明').resolve).toBe(1);
		expect(row(report, '116').query).toBe(1);
		expect(row(report, '116').resolve).toBe(0);
	});

	it('対象ライブラリは resolve が libraryName、query が libraryId', () => {
		const report = build([
			{
				source: source('generator'),
				records: [
					resolveCall({ id: 'a', branch: B116, library: 'Supabase SSR' }),
					queryCall({ id: 'b', branch: B116, libraryId: '/supabase/ssr' })
				]
			}
		]);
		expect(row(report, '116').libraries).toEqual(['/supabase/ssr', 'Supabase SSR']);
	});

	it('Svelte MCP は参考値として別に数える', () => {
		const report = build([
			{
				source: source('generator'),
				records: [
					toolUse({ id: 's', name: 'mcp__plugin_svelte_svelte__svelte-autofixer', branch: B116 })
				]
			}
		]);
		expect(report.agents).toEqual([{ issue: '116', agent: 'generator', context7: 0, svelte: 1 }]);
	});

	it('T-11: 呼び出しが 1 件も無い入力は空の表（エラーにしない）', () => {
		const report = build([{ source: source('main'), records: [] }]);
		expect(report.issues).toEqual([]);
		expect(report.libraries).toEqual([]);
		const md = formatMarkdown(report);
		expect(md).toContain('## issue 別');
		expect(md).toContain('（該当なし）');
	});

	it('--issue で呼び出しの無い issue を指定しても空の結果になる', () => {
		const report = build(
			[{ source: source('generator'), records: [queryCall({ id: 'a', branch: B116 })] }],
			undefined,
			999
		);
		expect(report.issues).toEqual([]);
		expect(report.calls).toEqual([]);
	});
});

describe('障害', () => {
	it('T-8 / 追加: is_error が無くても `Invalid API key` の文言を障害として数える', () => {
		const report = build([
			{
				source: source('main'),
				records: [
					resolveCall({ id: 'a', branch: B116 }),
					toolResult({ branch: B116, toolUseId: 'a', text: 'Invalid API key. Please check' }),
					resolveCall({ id: 'b', branch: B116 }),
					toolResult({ branch: B116, toolUseId: 'b', text: 'synthetic successful result text' })
				]
			}
		]);
		expect(row(report, '116').failures).toBe(1);
		expect(report.calls.map((c) => c.failure)).toEqual(['キー失効・認証エラー', null]);
	});
});

describe('QA イテレーション・FAIL 回数', () => {
	it('T-5: iter1 FAIL → iter2 PASS でイテレーション 2・FAIL 1', () => {
		const report = build([
			{
				source: source('evaluator'),
				records: [
					writeFile({
						id: 'w1',
						branch: B116,
						path: `${WS116}/qa_report_iter1.md`,
						content: qaReport('FAIL'),
						ts: '2026-10-03T10:00:00.000Z'
					}),
					writeFile({
						id: 'w2',
						branch: B116,
						path: `${WS116}/qa_report_iter2.md`,
						content: qaReport('PASS'),
						ts: '2026-10-03T11:00:00.000Z'
					})
				]
			}
		]);
		const r = row(report, '116');
		expect(r.qaIterations).toBe('2');
		expect(r.qaFails).toBe('1');
	});

	it('T-6: 同じパスへの 2 回の Write は最後の内容を採用', () => {
		const report = build([
			{
				source: source('evaluator'),
				records: [
					writeFile({
						id: 'w2',
						branch: B116,
						path: `${WS116}/qa_report_iter1.md`,
						content: qaReport('PASS'),
						ts: '2026-10-03T11:00:00.000Z'
					}),
					writeFile({
						id: 'w1',
						branch: B116,
						path: `${WS116}/qa_report_iter1.md`,
						content: qaReport('FAIL'),
						ts: '2026-10-03T10:00:00.000Z'
					})
				]
			}
		]);
		const r = row(report, '116');
		expect(r.qaIterations).toBe('1');
		expect(r.qaFails).toBe('0');
	});

	it('worktree 内の .dev-loop への Write も、ブランチから求めた issue に紐付く', () => {
		const report = build([
			{
				source: source('evaluator'),
				records: [
					writeFile({
						id: 'w1',
						branch: 'feat/issue-112-docker-container-naming',
						path: '/r/.claude/worktrees/docker-container-naming/.dev-loop/20261003-docker-container-naming/qa_report_iter1.md',
						content: qaReport('FAIL')
					})
				]
			}
		]);
		expect(row(report, '112').qaFails).toBe('1');
	});

	it('T-14: 旧形式 qa_report.md はイテレーション数・FAIL 回数が「不明（旧形式）」（0 にしない）', () => {
		const report = build([
			{
				source: source('evaluator'),
				records: [
					writeFile({
						id: 'w1',
						branch: 'feat/issue-73-plan-date',
						path: '/r/.dev-loop/20260831-plan-date/qa_report.md',
						content: qaReport('PASS')
					})
				]
			}
		]);
		const r = row(report, '73');
		expect(r.qaIterations).toBe(LEGACY_LABEL);
		expect(r.qaFails).toBe(LEGACY_LABEL);
		expect(r.legacyQaWrites).toBe(1);
		expect(report.warnings.some((w) => w.includes('旧形式'))).toBe(true);
	});

	it('T-13: スラッグ不一致の QA は issue 不明（要確認）に入り、警告はワークスペース単位に 1 件', () => {
		const wrongBranch = 'feat/issue-73-plan-date';
		const ws = '/r/.dev-loop/20260901-docker-mcp-toolkit';
		const report = build([
			{
				source: source('evaluator'),
				records: [
					writeFile({
						id: 'a',
						branch: wrongBranch,
						path: `${ws}/qa_report.md`,
						content: qaReport('PASS')
					}),
					readFile({ id: 'b', branch: wrongBranch, path: `${ws}/spec.md` }),
					readFile({ id: 'c', branch: wrongBranch, path: `${ws}/sprint_contract.md` })
				]
			}
		]);
		expect(report.issues.find((r) => r.label === '73')?.legacyQaWrites ?? 0).toBe(0);
		expect(row(report, 'issue 不明（要確認）').legacyQaWrites).toBe(1);
		const warns = report.warnings.filter((w) => w.includes('20260901-docker-mcp-toolkit'));
		expect(warns).toHaveLength(1);
		expect(warns[0]).toContain('3 件');
	});
});

describe('導入前/後', () => {
	const at = (ts: string) =>
		build([{ source: source('main'), records: [resolveCall({ id: 'a', branch: B116, ts })] }]);
	it('追加: 境界（UTC）の直前は導入前、直後・境界ちょうど・ミリ秒付きは導入後', () => {
		expect(CONTEXT7_INTRODUCED_AT).toBe('2026-10-03T07:29:49Z');
		expect(row(at('2026-10-03T07:29:48.999Z'), '116').phase).toBe('導入前');
		expect(row(at('2026-10-03T07:29:49.000Z'), '116').phase).toBe('導入後');
		expect(row(at('2026-10-03T07:29:49.100Z'), '116').phase).toBe('導入後');
	});
	it('T-24: 「issue 不明」「ベンチ」の行は導入前/後が —', () => {
		const report = build([
			{
				source: source('main'),
				records: [
					resolveCall({ id: 'a', branch: 'main', ts: '2026-10-03T07:00:00.000Z' }),
					resolveCall({
						id: 'b',
						branch: 'bench/c7-supabase-ari-1',
						ts: '2026-10-03T08:00:00.000Z'
					})
				]
			}
		]);
		expect(row(report, 'issue 不明').phase).toBe('—');
		expect(row(report, 'ベンチ').phase).toBe('—');
	});
});

describe('所要時間とトークン', () => {
	it('T-20: タイムスタンプが逆転していても最小値と最大値の差。複数ファイルは合計', () => {
		const stamp = (ts: string) => assistantText({ branch: B116, ts, text: 'x' });
		const report = build([
			{
				source: source('generator', '/s/a.jsonl'),
				records: [
					stamp('2026-10-03T14:00:00.000Z'),
					stamp('2026-10-03T15:00:00.075Z'),
					stamp('2026-10-03T15:00:00.074Z')
				]
			},
			{
				source: source('generator', '/s/b.jsonl'),
				records: [stamp('2026-10-04T10:00:00.000Z'), stamp('2026-10-04T10:30:00.000Z')]
			}
		]);
		expect(row(report, '116').durationMs).toBe(3_600_075 + 1_800_000);
	});

	it('formatDuration', () => {
		expect(formatDuration(76187661)).toBe('21h09m47.661s');
		expect(formatDuration(null)).toBe('—');
		expect(formatDuration(47_661)).toBe('47.661s');
	});

	it('トークンはメッセージ ID で重複排除（フィールドごとの最大値）し、generator のみ計上', () => {
		const usage1 = { input_tokens: 10, output_tokens: 1 };
		const usage2 = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 };
		const report = build([
			{
				source: source('generator'),
				records: [
					toolUse({ id: 'a', name: 'Bash', branch: B116, messageId: 'm1', usage: usage1 }),
					toolUse({ id: 'b', name: 'Bash', branch: B116, messageId: 'm1', usage: usage2 })
				]
			},
			{
				source: source('evaluator', '/s/e.jsonl'),
				records: [toolUse({ id: 'c', name: 'Bash', branch: B116, messageId: 'm2', usage: usage2 })]
			}
		]);
		expect(row(report, '116').generatorTokens).toBe(115);
	});
});

describe('申告との突合', () => {
	const noSection = '# 自己評価\n\n本文\n';
	const claimsUse =
		'## Context7 使用記録\n\n- 該当場面: あり\n\n| ライブラリ | v |\n| --- | --- |\n| @supabase/ssr | 1 |\n';
	const claimsNone =
		'## Context7 使用記録\n\n- 該当場面: なし\n\n| ライブラリ | v |\n| --- | --- |\n';

	it('T-10: 節あり・申告ありで実績 0 → 不一致の警告', () => {
		const report = build(
			[
				{
					source: source('generator'),
					records: [
						writeFile({ id: 'w', branch: B116, path: `${WS116}/self_evaluation.md`, content: 'x' })
					]
				}
			],
			devLoop({ '20261003-supabase-email-password-auth': claimsUse })
		);
		const r = row(report, '116');
		expect(r.usageRecord).toBe('節あり');
		expect(r.mismatch).toBe('あり');
		expect(report.warnings.some((w) => w.startsWith('申告との不一致'))).toBe(true);
	});

	it('節あり・申告と実績が一致すれば不一致なし（申告なし×実績なし、申告あり×実績あり）', () => {
		const withCalls = build(
			[
				{
					source: source('generator'),
					records: [
						queryCall({ id: 'q', branch: B116 }),
						readFile({ id: 'r', branch: B116, path: `${WS116}/spec.md` })
					]
				}
			],
			devLoop({ '20261003-supabase-email-password-auth': claimsUse })
		);
		expect(row(withCalls, '116').mismatch).toBe('なし');
		const noCalls = build(
			[
				{
					source: source('generator'),
					records: [readFile({ id: 'r', branch: B116, path: `${WS116}/spec.md` })]
				}
			],
			devLoop({ '20261003-supabase-email-password-auth': claimsNone })
		);
		expect(row(noCalls, '116').mismatch).toBe('なし');
	});

	it('節あり・申告なしで実績あり → 不一致', () => {
		const report = build(
			[
				{
					source: source('generator'),
					records: [
						queryCall({ id: 'q', branch: B116 }),
						readFile({ id: 'r', branch: B116, path: `${WS116}/spec.md` })
					]
				}
			],
			devLoop({ '20261003-supabase-email-password-auth': claimsNone })
		);
		expect(row(report, '116').mismatch).toBe('あり');
	});

	it('T-21: Write/Edit が無く Read だけでも issue に紐付く。節なしで実績ありは「使用記録なし」警告', () => {
		const report = build(
			[
				{
					source: source('evaluator', '/s/e.jsonl'),
					records: [
						readFile({
							id: 'r',
							branch: 'feat/issue-115-migrate-db-to-postgres',
							path: '/r/.dev-loop/20261003-migrate-db-to-postgres/self_evaluation.md'
						})
					]
				},
				{
					source: source('generator', '/s/g.jsonl'),
					records: [queryCall({ id: 'q', branch: 'feat/issue-115-migrate-db-to-postgres' })]
				}
			],
			devLoop({ '20261003-migrate-db-to-postgres': noSection })
		);
		expect(row(report, '115').usageRecord).toBe('節なし');
		expect(report.warnings.some((w) => w.startsWith('使用記録なし'))).toBe(true);
	});

	it('T-21: Edit でも紐付く', () => {
		const report = build(
			[
				{
					source: source('generator'),
					records: [editFile({ id: 'e', branch: B116, path: `${WS116}/self_evaluation.md` })]
				}
			],
			devLoop({ '20261003-supabase-email-password-auth': noSection })
		);
		expect(row(report, '116').usageRecord).toBe('節なし');
	});

	it('T-22: worktree 側 path の Write を、メインの .dev-loop の実ファイルとワークスペース名で突き合わせる', () => {
		const report = build(
			[
				{
					source: source('generator'),
					records: [
						writeFile({
							id: 'w',
							branch: 'feat/issue-112-docker-container-naming',
							path: '/r/.claude/worktrees/docker-container-naming/.dev-loop/20261003-docker-container-naming/self_evaluation.md',
							content: 'x'
						})
					]
				}
			],
			devLoop({ '20261003-docker-container-naming': noSection })
		);
		expect(row(report, '112').usageRecord).toBe('節なし');
		expect(report.workspaces[0].workspace).toBe('20261003-docker-container-naming');
	});

	it('T-23: 「ファイル無し」「節なし」「紐付け不能」を区別する。main 等の行は紐付けに使わず、複数 issue は紐付け不能', () => {
		const B73 = 'feat/issue-73-plan-date';
		const report = build(
			[
				{
					source: source('main'),
					records: [
						// main ブランチの行は issue 番号が無いので紐付けから外れる（ワークスペースが「複数 issue」にならない）
						writeFile({
							id: 'm1',
							branch: 'main',
							path: '/r/.dev-loop/20260831-plan-date/issue.md',
							content: 'x'
						}),
						writeFile({
							id: 'a',
							branch: B73,
							path: '/r/.dev-loop/20260831-plan-date/self_evaluation.md',
							content: 'x'
						}),
						// 同じワークスペース名に、スラッグ一致の別 issue ブランチが 2 つ → 複数 issue
						readFile({
							id: 'b',
							branch: 'feat/issue-5-multi',
							path: '/r/.dev-loop/20260101-multi/spec.md'
						}),
						readFile({
							id: 'c',
							branch: 'feat/issue-6-multi',
							path: '/r/.dev-loop/20260101-multi/spec.md'
						}),
						writeFile({
							id: 'd',
							branch: 'feat/issue-7-with-eval',
							path: '/r/.dev-loop/20260102-with-eval/self_evaluation.md',
							content: 'x'
						})
					]
				}
			],
			devLoop({
				'20260102-with-eval': '# x\n',
				'20260101-multi': '# x\n',
				'20260999-orphan': '# x\n'
			})
		);
		expect(row(report, '73').usageRecord).toBe('ファイル無し');
		expect(row(report, '7').usageRecord).toBe('節なし');
		const byWs = Object.fromEntries(report.workspaces.map((w) => [w.workspace, w.usageRecord]));
		expect(byWs['20260101-multi']).toBe('紐付け不能');
		expect(byWs['20260999-orphan']).toBe('紐付け不能');
		expect(byWs['20260831-plan-date']).toBe('ファイル無し');
		expect(
			report.warnings.some(
				(w) => w.includes('20260831-plan-date') && w.startsWith('スラッグ不一致')
			)
		).toBe(true);
	});

	it('--dev-loop 未指定なら使用記録の有無は「未指定」', () => {
		const report = build([
			{ source: source('generator'), records: [queryCall({ id: 'q', branch: B116 })] }
		]);
		expect(row(report, '116').usageRecord).toBe('未指定');
	});
});

describe('壊れた入力と出力のプライバシー', () => {
	it('T-9: 壊れた行のスキップ件数が警告に出て、他の行は集計される', () => {
		const report = build([
			{ source: source('generator'), records: [queryCall({ id: 'a', branch: B116 })], badLines: 2 }
		]);
		expect(row(report, '116').query).toBe(1);
		expect(report.warnings.some((w) => w.includes('2 行'))).toBe(true);
	});

	it('meta.json 欠落は警告に出る', () => {
		const facts = extractFacts([], { path: '/s/x.jsonl', agent: 'unknown', metaMissing: true }, 0);
		expect(aggregate(facts).warnings.some((w) => w.includes('meta.json'))).toBe(true);
	});

	it('T-19: tool_result 本文・プロンプト本文のセンチネル文字列は Markdown / JSON のどちらにも出ない', () => {
		const report = build([
			{
				source: source('generator'),
				records: [
					userText({ branch: B116, text: 'SENTINEL_PROMPT_BODY' }),
					resolveCall({ id: 'a', branch: B116 }),
					toolResult({
						branch: B116,
						toolUseId: 'a',
						text: 'SENTINEL_RESULT_BODY Invalid API key'
					}),
					queryCall({ id: 'b', branch: B116 }),
					toolResult({ branch: B116, toolUseId: 'b', text: 'SENTINEL_RESULT_BODY2 docs' })
				]
			}
		]);
		for (const out of [formatMarkdown(report, true), formatJson(report)]) {
			expect(out).not.toContain('SENTINEL_');
		}
	});

	it('クエリ文は先頭だけに切り詰める', () => {
		const long = 'a'.repeat(300);
		const report = build([
			{ source: source('generator'), records: [queryCall({ id: 'a', branch: B116, query: long })] }
		]);
		expect(report.calls[0].query.length).toBeLessThan(80);
		expect(formatMarkdown(report, true)).not.toContain(long);
	});

	it('JSON 出力は標準の JSON パーサで読める', () => {
		const report = build([
			{ source: source('generator'), records: [queryCall({ id: 'a', branch: B116 })] }
		]);
		const parsed = JSON.parse(formatJson(report)) as Report;
		expect(parsed.issues).toHaveLength(1);
	});
});
