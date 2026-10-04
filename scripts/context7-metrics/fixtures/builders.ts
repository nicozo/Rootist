// テスト用の合成レコードを作るビルダー。実セッション記録の抜粋は含めない（全て架空の値）。
import type { RawRecord, Source } from '../types.ts';

export const RESOLVE = 'mcp__MCP_DOCKER__resolve-library-id';
export const QUERY = 'mcp__MCP_DOCKER__query-docs';

interface Base {
	branch?: string;
	ts?: string;
}

function base({ branch = 'main', ts = '2026-10-03T10:00:00.000Z' }: Base): RawRecord {
	return { gitBranch: branch, timestamp: ts, cwd: '/synthetic' };
}

/** assistant の tool_use 行。`messageId` と `usage` を指定すると、同じメッセージを複数行に分けた状況を作れる。 */
export function toolUse(
	opts: Base & {
		id: string;
		name: string;
		input?: Record<string, unknown>;
		messageId?: string;
		usage?: Record<string, number>;
	}
): RawRecord {
	return {
		...base(opts),
		type: 'assistant',
		message: {
			id: opts.messageId ?? `msg_${opts.id}`,
			role: 'assistant',
			content: [{ type: 'tool_use', id: opts.id, name: opts.name, input: opts.input ?? {} }],
			usage: opts.usage ?? { input_tokens: 1, output_tokens: 1 }
		}
	};
}

export function resolveCall(opts: Base & { id: string; library?: string }): RawRecord {
	return toolUse({
		...opts,
		name: RESOLVE,
		input: { libraryName: opts.library ?? 'Synthetic Lib', query: 'q' }
	});
}

export function queryCall(
	opts: Base & { id: string; libraryId?: string; query?: string }
): RawRecord {
	return toolUse({
		...opts,
		name: QUERY,
		input: {
			libraryId: opts.libraryId ?? '/synthetic/lib',
			query: opts.query ?? 'how to use the api'
		}
	});
}

export function assistantText(opts: Base & { text: string }): RawRecord {
	return {
		...base(opts),
		type: 'assistant',
		message: { id: 'msg_text', content: [{ type: 'text', text: opts.text }] }
	};
}

/** ツール定義の一覧（遅延ツール読み込み時にツール名を含んで記録される行）の合成。 */
export function toolListing(opts: Base = {}): RawRecord {
	return {
		...base(opts),
		type: 'attachment',
		attachment: {
			type: 'prompt_snapshot',
			systemPrompt: [`tools: ${RESOLVE}, ${QUERY}, ${RESOLVE}, ${QUERY}`]
		}
	};
}

export function userText(opts: Base & { text: string }): RawRecord {
	return { ...base(opts), type: 'user', message: { role: 'user', content: opts.text } };
}

export function toolResult(
	opts: Base & { toolUseId: string; text: string; isError?: boolean }
): RawRecord {
	return {
		...base(opts),
		type: 'user',
		message: {
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: opts.toolUseId,
					content: [{ type: 'text', text: opts.text }],
					...(opts.isError === undefined ? {} : { is_error: opts.isError })
				}
			]
		}
	};
}

export function writeFile(opts: Base & { id: string; path: string; content: string }): RawRecord {
	return toolUse({
		...opts,
		name: 'Write',
		input: { file_path: opts.path, content: opts.content }
	});
}

export function readFile(opts: Base & { id: string; path: string }): RawRecord {
	return toolUse({ ...opts, name: 'Read', input: { file_path: opts.path } });
}

export function editFile(opts: Base & { id: string; path: string }): RawRecord {
	return toolUse({
		...opts,
		name: 'Edit',
		input: { file_path: opts.path, old_string: 'a', new_string: 'b' }
	});
}

export function source(agent: string, path = `/synthetic/${agent}.jsonl`): Source {
	return { path, agent, metaMissing: false };
}

/** 装飾付きの QA レポート本文。 */
export function qaReport(verdict: string): string {
	return `# QA 評価レポート\n\n## 総合判定: **${verdict}**（補足の括弧書き）\n\n本文\n`;
}
