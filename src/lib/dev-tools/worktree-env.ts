// issue #152: エージェントが `.env` の値を読まずに worktree の環境を準備・確認するための窓口コマンドのロジック。
// 入口は scripts/worktree-env.mjs（副作用＝ファイル入出力・git の実行・終了コード）。
//
// 約束（.claude/rules/agent-env-access.md）:
// - 標準出力・標準エラー・例外メッセージに、許可リスト（ALLOWED_KEYS）の 2 キー以外の値と、解析できない行の内容を出さない。
//   エラーは固定文言＋キー名・行番号・パスのみ。
// - setup の対象は `git worktree list` に登録された、メイン以外の worktree だけ（任意の場所へ値を複製しない）。
// - 2 キーの値の規則（命名・ポート）の正は .claude/rules/docker-worktree.md。ここはそれを実装している。
//
// 制約: SvelteKit の仮想モジュール（$app/* など）や #lib エイリアスを import しない。Node の型除去で
// そのまま実行できる構文（enum / parameter properties / namespace を使わない）だけで書く。
// 副作用は Deps として注入する（テストでモックする）。
import { invalidLineNumbers, parseEnvFile, parseEnvLine } from './env-file.ts';

/** 値を出してよいキー。get の検査・setup の設定・compare の除外のすべてがこれを参照する（定義はここだけ）。 */
export const ALLOWED_KEYS = ['COMPOSE_PROJECT_NAME', 'DEV_PORT'] as const;
export type AllowedKey = (typeof ALLOWED_KEYS)[number];

/** issue 番号の上限（これ以上は DEV_PORT の規則 20000+N が成り立たない。docker-worktree.md）。 */
export const MAX_ISSUE_NUMBER = 9999;

export const ENV_FILE = '.env';
export const ENV_EXAMPLE_FILE = '.env.example';

/** 一時ファイル名。`.env.*.local` に一致させ、途中で落ちても deny（Read/Edit）で読めない名前にする。 */
export function tempFileName(pid: number): string {
	return `.env.worktree-env-${pid}.local`;
}

/** issue 番号 N の worktree 用の 2 キーの値（規則の正は docker-worktree.md）。 */
export function valuesForIssue(n: number): Record<AllowedKey, string> {
	return { COMPOSE_PROJECT_NAME: `rootist-issue-${n}`, DEV_PORT: String(20000 + n) };
}

export function parseIssueNumber(text: string): number | null {
	if (!/^[1-9][0-9]*$/.test(text)) return null;
	const n = Number(text);
	return n <= MAX_ISSUE_NUMBER ? n : null;
}

export function isAllowedKey(key: string): key is AllowedKey {
	return (ALLOWED_KEYS as readonly string[]).includes(key);
}

/** `git worktree list --porcelain` の出力から worktree のパス一覧を取り出す（先頭がメイン）。 */
export function parseWorktreeList(porcelain: string): string[] {
	const paths: string[] = [];
	for (const line of porcelain.split('\n')) {
		if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length));
	}
	return paths;
}

/**
 * 許可キーを「置換または追加し、各キーちょうど 1 回」にする。他の行は 1 バイトも変えない。
 * `export KEY=...` も同じキーとして置換対象。最初の出現位置に置き、重複行は除く。
 */
export function applyKeys(text: string, values: Record<AllowedKey, string>): string {
	const lines = text.split('\n');
	const seen = new Set<string>();
	const out: string[] = [];
	for (const rawLine of lines) {
		const parsed = parseEnvLine(rawLine);
		if (parsed.kind === 'entry' && isAllowedKey(parsed.key)) {
			if (seen.has(parsed.key)) continue;
			seen.add(parsed.key);
			const cr = rawLine.endsWith('\r') ? '\r' : '';
			out.push(`${parsed.key}=${values[parsed.key]}${cr}`);
			continue;
		}
		out.push(rawLine);
	}
	const missing = ALLOWED_KEYS.filter((key) => !seen.has(key));
	if (missing.length === 0) return out.join('\n');
	// 末尾が改行で終わる（最後の要素が空）ならその前に差し込む。改行で終わらなければ改行を足す。
	const endsWithNewline = out.length > 0 && out[out.length - 1] === '';
	const body = endsWithNewline ? out.slice(0, -1) : out;
	const appended = missing.map((key) => `${key}=${values[key]}`);
	if (body.length === 0 && !endsWithNewline) return appended.join('\n') + '\n';
	return [...body, ...appended].join('\n') + '\n';
}

export type GetResult = { state: 'value'; value: string } | { state: 'absent' };

/** parseEnvFile と同じ解釈（export 接頭辞・クォート除去・後勝ち）で 1 キーを取り出す。 */
export function getKey(text: string, key: string): GetResult {
	const env = parseEnvFile(text);
	return Object.prototype.hasOwnProperty.call(env, key)
		? { state: 'value', value: env[key] }
		: { state: 'absent' };
}

export type CompareResult =
	| { ok: true }
	| { ok: false; reason: 'keys'; keys: string[] }
	| { ok: false; reason: 'invalid'; main: number[]; target: number[] };

/** 許可キーを除いたキー集合と値の差を判定する。解析できない行が片方にでもあれば内容を比べず「要確認」。 */
export function compareEnv(mainText: string, targetText: string): CompareResult {
	const main = invalidLineNumbers(mainText);
	const target = invalidLineNumbers(targetText);
	if (main.length > 0 || target.length > 0) return { ok: false, reason: 'invalid', main, target };
	const a = parseEnvFile(mainText);
	const b = parseEnvFile(targetText);
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	const diff: string[] = [];
	for (const key of keys) {
		if (isAllowedKey(key)) continue;
		const inA = Object.prototype.hasOwnProperty.call(a, key);
		const inB = Object.prototype.hasOwnProperty.call(b, key);
		if (inA !== inB || a[key] !== b[key]) diff.push(key);
	}
	return diff.length === 0 ? { ok: true } : { ok: false, reason: 'keys', keys: diff.sort() };
}

export type AuditResult = {
	keys: { key: string; state: '設定あり' | '空' | '無し' }[];
	extra: string[];
};

/** `.env.example` の各キーの設定状況と、`.env.example` に無い余分なキーの名前。値は返さない。 */
export function auditEnv(exampleText: string, envText: string): AuditResult {
	const example = Object.keys(parseEnvFile(exampleText));
	const env = parseEnvFile(envText);
	const keys = example.map((key) => ({
		key,
		state: !Object.prototype.hasOwnProperty.call(env, key)
			? ('無し' as const)
			: env[key] === ''
				? ('空' as const)
				: ('設定あり' as const)
	}));
	const extra = Object.keys(env)
		.filter((key) => !example.includes(key))
		.sort();
	return { keys, extra };
}

export type Deps = {
	cwd: string;
	pid: number;
	/** 登録済み worktree の realpath（先頭がメイン）。取得できなければ null。 */
	listWorktrees(cwd: string): string[] | null;
	realpath(path: string): string | null;
	/** 無ければ null。 */
	readText(path: string): string | null;
	isSymlink(path: string): boolean;
	copyFile(from: string, to: string): void;
	/** 一時ファイルに書いて rename する。失敗したら一時ファイルを消して例外を投げる。 */
	writeAtomic(tempPath: string, finalPath: string, text: string): void;
};

export type Result = { code: number; stdout: string; stderr: string };

export const HELP = `使い方: pnpm -s worktree-env <サブコマンド> [--worktree <パス>]

値を出さずに worktree の環境ファイルを準備・確認する窓口コマンド（エージェントは環境ファイルを直接読めない。
範囲と理由は .claude/rules/agent-env-access.md）。

  setup [<N>]       メインから worktree へコピーし（無い場合のみ）、N があれば
                    COMPOSE_PROJECT_NAME=rootist-issue-<N> と DEV_PORT=<20000+N> を設定する。
                    対象はメイン以外の登録済み worktree だけ。N は 1〜${MAX_ISSUE_NUMBER}
  get <KEY>         ${ALLOWED_KEYS.join(' / ')} の値だけを出す。終了コード 0=値あり 3=キー無し 2=許可外・エラー
  compare           メインとの差を「想定内」か「要確認」で出す（差分は項目名だけ）。0=想定内 1=要確認 2=エラー
  audit             .env.example の各キーの設定状況（設定あり / 空 / 無し）と、余分なキーの名前を出す
  --help            この説明

--worktree を省略すると現在のディレクトリを対象にする。登録済み worktree（git worktree list）以外は失敗する。
`;

function fail(code: number, message: string): Result {
	return { code, stdout: '', stderr: message + '\n' };
}

type Parsed = { positionals: string[]; worktree: string | null; error: string | null };

function parseOptions(args: string[]): Parsed {
	const positionals: string[] = [];
	let worktree: string | null = null;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--worktree') {
			const next = args[i + 1];
			if (next === undefined || next.startsWith('--')) {
				return { positionals, worktree, error: '--worktree にはパスを指定してください' };
			}
			worktree = next;
			i++;
		} else if (args[i].startsWith('--')) {
			return { positionals, worktree, error: '未知のオプションです' };
		} else {
			positionals.push(args[i]);
		}
	}
	return { positionals, worktree, error: null };
}

type Resolved =
	| { ok: true; main: string; target: string; isMain: boolean }
	| { ok: false; result: Result };

function resolveTarget(deps: Deps, worktree: string | null): Resolved {
	const list = deps.listWorktrees(deps.cwd);
	if (list === null || list.length === 0) {
		return { ok: false, result: fail(1, 'git worktree list を取得できませんでした') };
	}
	const real = deps.realpath(worktree ?? deps.cwd);
	const index = real === null ? -1 : list.indexOf(real);
	if (real === null || index === -1) {
		return {
			ok: false,
			result: fail(1, '対象は git worktree list に登録された worktree ではありません')
		};
	}
	return { ok: true, main: list[0], target: real, isMain: index === 0 };
}

const join = (dir: string, name: string) => (dir.endsWith('/') ? dir + name : `${dir}/${name}`);

export function run(argv: string[], deps: Deps): Result {
	const [sub, ...rest] = argv;
	if (sub === undefined || sub === '--help' || sub === '-h' || sub === 'help') {
		return { code: 0, stdout: HELP, stderr: '' };
	}
	const parsed = parseOptions(rest);
	if (parsed.error !== null) return fail(2, parsed.error);

	try {
		if (sub === 'setup') return setup(parsed, deps);
		if (sub === 'get') return get(parsed, deps);
		if (sub === 'compare') return compare(parsed, deps);
		if (sub === 'audit') return audit(parsed, deps);
	} catch {
		// 例外の内容（パスや行を含みうる）は出さない
		return fail(1, '処理に失敗しました');
	}
	return fail(2, `未知のサブコマンドです。pnpm -s worktree-env --help を参照してください`);
}

function setup(parsed: Parsed, deps: Deps): Result {
	if (parsed.positionals.length > 1) return fail(1, '引数が多すぎます');
	let n: number | null = null;
	if (parsed.positionals.length === 1) {
		n = parseIssueNumber(parsed.positionals[0]);
		if (n === null) return fail(1, `issue 番号は 1〜${MAX_ISSUE_NUMBER} の整数で指定してください`);
	}
	const resolved = resolveTarget(deps, parsed.worktree);
	if (!resolved.ok) return resolved.result;
	if (resolved.isMain) return fail(1, 'メインのワーキングツリーは対象にできません');

	const mainEnv = join(resolved.main, ENV_FILE);
	const targetEnv = join(resolved.target, ENV_FILE);
	const mainText = deps.readText(mainEnv);
	if (mainText === null) return fail(1, 'メインに環境ファイルが無いため何も作りません');
	if (deps.isSymlink(targetEnv)) {
		return fail(1, '対象の環境ファイルがシンボリックリンクのため何も書きません');
	}

	let text = deps.readText(targetEnv);
	let outcome: string;
	if (text === null) {
		deps.copyFile(mainEnv, targetEnv);
		text = mainText;
		outcome = 'コピー済み';
	} else {
		outcome = n === null ? '既存を維持' : 'キー設定のみ';
	}

	const lines: string[] = [];
	if (n !== null) {
		const values = valuesForIssue(n);
		const next = applyKeys(text, values);
		if (next !== text) {
			deps.writeAtomic(join(resolved.target, tempFileName(deps.pid)), targetEnv, next);
		}
		for (const key of ALLOWED_KEYS) lines.push(`${key}=${values[key]}`);
	}
	lines.push(outcome);
	return { code: 0, stdout: lines.join('\n') + '\n', stderr: '' };
}

function get(parsed: Parsed, deps: Deps): Result {
	if (parsed.positionals.length !== 1) return fail(2, 'キー名を 1 つ指定してください');
	const key = parsed.positionals[0];
	if (!isAllowedKey(key)) {
		return fail(2, `許可されていないキーです（許可: ${ALLOWED_KEYS.join(' / ')}）`);
	}
	const resolved = resolveTarget(deps, parsed.worktree);
	if (!resolved.ok) return { ...resolved.result, code: 2 };
	const text = deps.readText(join(resolved.target, ENV_FILE));
	if (text === null) return fail(2, '対象に環境ファイルがありません');
	const result = getKey(text, key);
	if (result.state === 'absent') return fail(3, '未設定');
	return { code: 0, stdout: result.value + '\n', stderr: '' };
}

function compare(parsed: Parsed, deps: Deps): Result {
	if (parsed.positionals.length > 0) return fail(2, '引数が多すぎます');
	const resolved = resolveTarget(deps, parsed.worktree);
	if (!resolved.ok) return { ...resolved.result, code: 2 };
	const mainText = deps.readText(join(resolved.main, ENV_FILE));
	const targetText = deps.readText(join(resolved.target, ENV_FILE));
	if (mainText === null || targetText === null) return fail(2, '環境ファイルがありません');
	const result = compareEnv(mainText, targetText);
	if (result.ok) return { code: 0, stdout: '想定内\n', stderr: '' };
	if (result.reason === 'keys') {
		return { code: 1, stdout: `要確認\n差分キー: ${result.keys.join(', ')}\n`, stderr: '' };
	}
	const fmt = (numbers: number[]) => (numbers.length === 0 ? 'なし' : numbers.join(','));
	return {
		code: 1,
		stdout: `要確認\n解析できない行: メイン ${fmt(result.main)} / 対象 ${fmt(result.target)}（行番号）\n`,
		stderr: ''
	};
}

function audit(parsed: Parsed, deps: Deps): Result {
	if (parsed.positionals.length > 0) return fail(2, '引数が多すぎます');
	const resolved = resolveTarget(deps, parsed.worktree);
	if (!resolved.ok) return { ...resolved.result, code: 2 };
	const example = deps.readText(join(resolved.target, ENV_EXAMPLE_FILE));
	const env = deps.readText(join(resolved.target, ENV_FILE));
	if (example === null || env === null) return fail(2, '環境ファイルまたは雛形がありません');
	const result = auditEnv(example, env);
	const lines = result.keys.map((entry) => `${entry.key}: ${entry.state}`);
	lines.push(`余分なキー: ${result.extra.length === 0 ? 'なし' : result.extra.join(', ')}`);
	return { code: 0, stdout: lines.join('\n') + '\n', stderr: '' };
}
