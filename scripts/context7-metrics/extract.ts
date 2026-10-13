import { parseWorkspacePath } from './branch.ts';
import type { Context7Kind, RawRecord, ToolResult, ToolUse, Usage } from './types.ts';

/** Context7 のツール名（完全一致のみ。`mcp__MCP_DOCKER__` 接頭辞だけでは判定しない）。 */
export const CONTEXT7_TOOLS: Record<string, Context7Kind> = {
	'mcp__MCP_DOCKER__resolve-library-id': 'resolve',
	'mcp__MCP_DOCKER__query-docs': 'query'
};

/** Svelte MCP（比較用の参考値）。 */
export const SVELTE_MCP_PREFIX = 'mcp__plugin_svelte_svelte__';

/** クエリ要約の最大文字数。 */
export const QUERY_SUMMARY_LENGTH = 60;

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** content が配列のときだけブロック列を返す。 */
function blocks(rec: RawRecord): unknown[] {
	const message = rec.message;
	if (!isObject(message) || !Array.isArray(message.content)) return [];
	return message.content;
}

/** assistant 行の tool_use ブロックだけを取り出す（ツール定義一覧・テキスト・tool_result は対象外）。 */
export function extractToolUses(rec: RawRecord): ToolUse[] {
	if (rec.type !== 'assistant') return [];
	const out: ToolUse[] = [];
	for (const b of blocks(rec)) {
		if (!isObject(b) || b.type !== 'tool_use') continue;
		const id = str(b.id);
		const name = str(b.name);
		if (!id || !name) continue;
		out.push({ id, name, input: isObject(b.input) ? b.input : {} });
	}
	return out;
}

/** tool_use が Context7 の呼び出しならその種別を返す。 */
export function context7Kind(name: string): Context7Kind | null {
	return Object.hasOwn(CONTEXT7_TOOLS, name) ? CONTEXT7_TOOLS[name] : null;
}

export function isSvelteMcp(name: string): boolean {
	return name.startsWith(SVELTE_MCP_PREFIX);
}

/** Context7 呼び出しの集計キー（resolve は libraryName、query は libraryId）。 */
export function context7Library(kind: Context7Kind, input: Record<string, unknown>): string {
	return str(kind === 'resolve' ? input.libraryName : input.libraryId) || '(不明)';
}

/** 要約表示用にクエリ文を切り詰める。改行・表区切りも潰す。 */
export function summarizeQuery(input: Record<string, unknown>): string {
	const q = str(input.query).replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
	return q.length > QUERY_SUMMARY_LENGTH ? `${q.slice(0, QUERY_SUMMARY_LENGTH)}…` : q;
}

/** user 行の tool_result ブロックを取り出す。本文は障害判定用に先頭だけ保持する。 */
export function extractToolResults(rec: RawRecord): ToolResult[] {
	if (rec.type !== 'user') return [];
	const out: ToolResult[] = [];
	for (const b of blocks(rec)) {
		if (!isObject(b) || b.type !== 'tool_result') continue;
		const toolUseId = str(b.tool_use_id);
		if (!toolUseId) continue;
		let head = '';
		if (typeof b.content === 'string') head = b.content.slice(0, 400);
		else if (Array.isArray(b.content)) {
			for (const c of b.content) {
				if (isObject(c) && c.type === 'text') head += str(c.text);
				if (head.length >= 400) break;
			}
			head = head.slice(0, 400);
		}
		out.push({ toolUseId, isError: b.is_error === true, head });
	}
	return out;
}

/** assistant 行のメッセージ ID と使用量。同じメッセージが複数行に分かれて記録されても ID で束ねられる。 */
export function extractUsage(rec: RawRecord): Usage | null {
	if (rec.type !== 'assistant') return null;
	const message = rec.message;
	if (!isObject(message)) return null;
	const messageId = str(message.id);
	if (!messageId || !isObject(message.usage)) return null;
	const u = message.usage;
	return {
		messageId,
		input: num(u.input_tokens),
		output: num(u.output_tokens),
		cacheCreation: num(u.cache_creation_input_tokens),
		cacheRead: num(u.cache_read_input_tokens)
	};
}

/** Usage の合計トークン（入力 + 出力 + キャッシュ作成 + キャッシュ読み取り）。 */
export function totalTokens(u: Usage): number {
	return u.input + u.output + u.cacheCreation + u.cacheRead;
}

/** 同一メッセージの使用量を、フィールドごとの最大値で合成する（ストリーミングで途中値が先に記録されるため）。 */
export function mergeUsage(a: Usage, b: Usage): Usage {
	return {
		messageId: a.messageId,
		input: Math.max(a.input, b.input),
		output: Math.max(a.output, b.output),
		cacheCreation: Math.max(a.cacheCreation, b.cacheCreation),
		cacheRead: Math.max(a.cacheRead, b.cacheRead)
	};
}

export type FileOp = { tool: 'Write' | 'Edit' | 'Read'; path: string; content: string };

/** Write / Edit / Read の tool_use からパスを取り出す。 */
export function extractFileOp(tu: ToolUse): FileOp | null {
	if (tu.name !== 'Write' && tu.name !== 'Edit' && tu.name !== 'Read') return null;
	const path = str(tu.input.file_path);
	if (!path) return null;
	return { tool: tu.name, path, content: tu.name === 'Write' ? str(tu.input.content) : '' };
}

export type QaTarget = { iter: number | null; ws: string; slug: string };

/** `qa_report_iter<N>.md`（N あり）または旧形式 `qa_report.md`（N なし）の Write 先を判定する。 */
export function qaReportTarget(path: string): QaTarget | null {
	const wp = parseWorkspacePath(path);
	if (!wp) return null;
	const iterMatch = /^qa_report_iter(\d+)\.md$/.exec(wp.file);
	if (iterMatch) return { iter: Number(iterMatch[1]), ws: wp.ws, slug: wp.slug };
	if (wp.file === 'qa_report.md') return { iter: null, ws: wp.ws, slug: wp.slug };
	return null;
}
