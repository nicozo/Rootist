import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DevLoopInfo } from './aggregate.ts';
import type { RawRecord, Source } from './types.ts';

/** 利用者に見せてよいエラー（スタックトレース無しで表示し、非ゼロ終了する）。 */
export class UserError extends Error {}

export const DEFAULT_SESSION_DIR = join(
	homedir(),
	'.claude',
	'projects',
	'-Users-katoukouhei-Dev-rootist'
);

/** `~` を展開する。 */
export function expandHome(p: string): string {
	return p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p;
}

/** agentType を集計用の名前にそろえる（旧名 `product-spec-planner` 等は planner に寄せる）。 */
export function normalizeAgent(agentType: string | undefined): string {
	if (!agentType) return 'unknown';
	if (/planner/i.test(agentType)) return 'planner';
	return agentType;
}

function isDir(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/** メイン（`*.jsonl`）とサブエージェント（`<session>/subagents/agent-*.jsonl`）の両方を列挙する。 */
export function collectSources(dir: string): Source[] {
	if (!isDir(dir)) throw new UserError(`セッション記録ディレクトリが見つかりません: ${dir}`);
	const sources: Source[] = [];
	for (const entry of readdirSync(dir).sort()) {
		const full = join(dir, entry);
		if (entry.endsWith('.jsonl')) {
			sources.push({ path: full, agent: 'main', metaMissing: false });
		} else if (isDir(full)) {
			const sub = join(full, 'subagents');
			if (!isDir(sub)) continue;
			for (const f of readdirSync(sub).sort()) {
				if (!/^agent-.*\.jsonl$/.test(f)) continue;
				const metaPath = join(sub, f.replace(/\.jsonl$/, '.meta.json'));
				let agentType: string | undefined;
				try {
					const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { agentType?: unknown };
					if (typeof meta.agentType === 'string') agentType = meta.agentType;
				} catch {
					// meta.json の欠落・破損は agentType 不明として扱う
				}
				sources.push({
					path: join(sub, f),
					agent: normalizeAgent(agentType),
					metaMissing: agentType === undefined
				});
			}
		}
	}
	return sources;
}

/** jsonl を読む。JSON として読めない行（途切れた最終行を含む）は数えてスキップする。 */
export function readJsonl(path: string): { records: RawRecord[]; badLines: number } {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return { records: [], badLines: 1 };
	}
	const records: RawRecord[] = [];
	let badLines = 0;
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		try {
			const v: unknown = JSON.parse(line);
			if (typeof v === 'object' && v !== null && !Array.isArray(v)) records.push(v as RawRecord);
			else badLines++;
		} catch {
			badLines++;
		}
	}
	return { records, badLines };
}

/** `.dev-loop/` を読み取り専用で開く。ワークスペース名は安全な文字だけを許す（パス走査防止）。 */
export function openDevLoop(dir: string): DevLoopInfo {
	if (!isDir(dir)) throw new UserError(`.dev-loop ディレクトリが見つかりません: ${dir}`);
	const workspaces = readdirSync(dir).filter(
		(e) => /^\d{8}-[\w.-]+$/.test(e) && isDir(join(dir, e))
	);
	return {
		workspaces,
		readSelfEvaluation(ws) {
			if (!/^\d{8}-[\w.-]+$/.test(ws)) return null;
			const p = join(dir, ws, 'self_evaluation.md');
			return existsSync(p) ? readFileSync(p, 'utf8') : null;
		}
	};
}
