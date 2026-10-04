// 集計スクリプト全体で共有する型。実行時には何も出力しない（型のみ）。

/** セッション記録（jsonl）の 1 行。形が保証されないので unknown ベースで扱う。 */
export type RawRecord = Record<string, unknown>;

/** Context7 の 2 ツール。 */
export type Context7Kind = 'resolve' | 'query';

/** assistant メッセージ内の tool_use ブロック（抽出後）。 */
export interface ToolUse {
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/** user 行の tool_result ブロック（抽出後）。本文は障害判定にだけ使い、保持しない。 */
export interface ToolResult {
	toolUseId: string;
	isError: boolean;
	/** 障害判定用の先頭部分のみ。出力には使わない。 */
	head: string;
}

/** メッセージ ID ごとの使用量。 */
export interface Usage {
	messageId: string;
	input: number;
	output: number;
	cacheCreation: number;
	cacheRead: number;
}

/** 1 つの記録ファイルの出どころ。 */
export interface Source {
	path: string;
	/** `main` / `generator` / `evaluator` / `planner` / その他の agentType / `unknown`（meta 欠落）。 */
	agent: string;
	metaMissing: boolean;
}

/** issue への紐付け結果。 */
export type IssueKey =
	| { kind: 'issue'; n: number }
	| { kind: 'unknown' }
	| { kind: 'unverified' }
	| { kind: 'bench' };

/** `.dev-loop/<ws>/...` を指すパスの分解結果。 */
export interface WorkspacePath {
	/** `<YYYYMMDD>-<slug>` のディレクトリ名。 */
	ws: string;
	slug: string;
	/** ワークスペース直下からの相対パス。 */
	file: string;
}

/** 1 ファイルから取り出した事実。纏めて `mergeFacts` で合成する。 */
export interface Facts {
	calls: CallFact[];
	svelteCalls: { id: string; branch: string; agent: string }[];
	results: { toolUseId: string; failure: string | null }[];
	usages: UsageFact[];
	/** QA レポートの Write。 */
	qaWrites: QaWriteFact[];
	/** `.dev-loop/<ws>/` 配下を指す Write / Edit / Read。ワークスペースの紐付けに使う。 */
	workspaceOps: { ws: string; slug: string; branch: string; tool: string }[];
	/** 行ごとの時刻（issue 別の期間と所要時間に使う）。 */
	stamps: StampFact[];
	badLines: number;
	metaMissing: number;
}

export interface CallFact {
	id: string;
	kind: Context7Kind;
	/** resolve は libraryName、query は libraryId。 */
	library: string;
	/** 先頭だけに切り詰めた要約。 */
	query: string;
	branch: string;
	agent: string;
	ts: string;
}

export interface UsageFact {
	messageId: string;
	tokens: Usage;
	branch: string;
	agent: string;
}

export interface QaWriteFact {
	ws: string;
	slug: string;
	/** `qa_report_iter<N>.md` なら N、旧形式 `qa_report.md` なら null。 */
	iter: number | null;
	verdict: 'PASS' | 'FAIL' | '判定不能';
	branch: string;
	ts: string;
	/** 同一 ts のときの順序決めに使う通し番号。 */
	seq: number;
	toolUseId: string;
}

export interface StampFact {
	branch: string;
	agent: string;
	file: string;
	ts: string;
}
