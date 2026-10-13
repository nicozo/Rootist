import {
	extractFileOp,
	extractToolResults,
	extractToolUses,
	extractUsage,
	context7Kind,
	context7Library,
	isSvelteMcp,
	qaReportTarget,
	summarizeQuery
} from './extract.ts';
import { parseWorkspacePath } from './branch.ts';
import { classifyFailure } from './failure.ts';
import { parseVerdict } from './verdict.ts';
import type { Facts, RawRecord, Source } from './types.ts';

export interface ExtractOptions {
	/** この日付（UTC, YYYY-MM-DD）以降の行だけを対象にする。 */
	since?: string;
	/** この日付（UTC, YYYY-MM-DD）以前の行だけを対象にする。 */
	until?: string;
}

export function emptyFacts(): Facts {
	return {
		calls: [],
		svelteCalls: [],
		results: [],
		usages: [],
		qaWrites: [],
		workspaceOps: [],
		stamps: [],
		badLines: 0,
		metaMissing: 0
	};
}

/** 複数ファイル分の事実を 1 つに合成する。 */
export function mergeFacts(all: Facts[]): Facts {
	const out = emptyFacts();
	for (const f of all) {
		out.calls.push(...f.calls);
		out.svelteCalls.push(...f.svelteCalls);
		out.results.push(...f.results);
		out.usages.push(...f.usages);
		out.qaWrites.push(...f.qaWrites);
		out.workspaceOps.push(...f.workspaceOps);
		out.stamps.push(...f.stamps);
		out.badLines += f.badLines;
		out.metaMissing += f.metaMissing;
	}
	return out;
}

function inRange(ts: string, opts: ExtractOptions): boolean {
	if (!ts) return true;
	const day = ts.slice(0, 10);
	if (opts.since && day < opts.since) return false;
	if (opts.until && day > opts.until) return false;
	return true;
}

/** 1 ファイル分のレコードから、集計に必要な事実だけを取り出す（純粋関数）。 */
export function extractFacts(
	records: RawRecord[],
	source: Source,
	badLines: number,
	opts: ExtractOptions = {}
): Facts {
	const facts = emptyFacts();
	facts.badLines = badLines;
	facts.metaMissing = source.metaMissing ? 1 : 0;
	let seq = 0;
	for (const rec of records) {
		const ts = typeof rec.timestamp === 'string' ? rec.timestamp : '';
		const branch = typeof rec.gitBranch === 'string' ? rec.gitBranch : '';
		if (!inRange(ts, opts)) continue;
		if (ts) facts.stamps.push({ branch, agent: source.agent, file: source.path, ts });

		for (const tu of extractToolUses(rec)) {
			const kind = context7Kind(tu.name);
			if (kind) {
				facts.calls.push({
					id: tu.id,
					kind,
					library: context7Library(kind, tu.input),
					query: summarizeQuery(tu.input),
					branch,
					agent: source.agent,
					ts
				});
			} else if (isSvelteMcp(tu.name)) {
				facts.svelteCalls.push({ id: tu.id, branch, agent: source.agent });
			}
			const op = extractFileOp(tu);
			if (!op) continue;
			const wp = parseWorkspacePath(op.path);
			if (wp) facts.workspaceOps.push({ ws: wp.ws, slug: wp.slug, branch, tool: op.tool });
			const qa = op.tool === 'Write' ? qaReportTarget(op.path) : null;
			if (qa) {
				facts.qaWrites.push({
					ws: qa.ws,
					slug: qa.slug,
					iter: qa.iter,
					verdict: parseVerdict(op.content),
					branch,
					ts,
					seq: seq++,
					toolUseId: tu.id
				});
			}
		}
		for (const r of extractToolResults(rec)) {
			facts.results.push({ toolUseId: r.toolUseId, failure: classifyFailure(r) });
		}
		const usage = extractUsage(rec);
		if (usage)
			facts.usages.push({ messageId: usage.messageId, tokens: usage, branch, agent: source.agent });
	}
	return facts;
}
