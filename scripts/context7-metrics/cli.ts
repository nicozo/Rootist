import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { aggregate } from './aggregate.ts';
import { extractFacts, mergeFacts } from './facts.ts';
import { formatJson, formatMarkdown } from './format.ts';
import {
	collectSources,
	DEFAULT_SESSION_DIR,
	expandHome,
	openDevLoop,
	readJsonl,
	UserError
} from './io.ts';

export interface CliOptions {
	dirs: string[];
	devLoop?: string;
	issue?: number;
	since?: string;
	until?: string;
	format: 'md' | 'json';
	calls: boolean;
}

export const USAGE = `使い方: pnpm metrics:context7 -- [オプション]
  --dir <path>        セッション記録ディレクトリ（複数指定可。既定: ${DEFAULT_SESSION_DIR}）
  --dev-loop <path>   .dev-loop ディレクトリ（self_evaluation.md の突合に使う。任意）
  --issue <N>         issue 番号で絞り込む
  --since <YYYY-MM-DD> / --until <YYYY-MM-DD>  期間（UTC）で絞り込む
  --format md|json    出力形式（既定: md）
  --calls             呼び出し一覧（クエリ先頭のみ）も出す
`;

/** pnpm は script 名の後ろの `--` をそのまま渡す。先頭の `--` は引数の終わりではないので取り除く。 */
export function stripLeadingDashes(argv: string[]): string[] {
	let i = 0;
	while (argv[i] === '--') i++;
	return argv.slice(i);
}

function checkDate(name: string, v: string | undefined): string | undefined {
	if (v === undefined) return undefined;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
		throw new UserError(`${name} は YYYY-MM-DD で指定してください: ${v}`);
	return v;
}

export function parseCliArgs(argv: string[]): CliOptions {
	let parsed;
	try {
		parsed = parseArgs({
			args: stripLeadingDashes(argv),
			options: {
				dir: { type: 'string', multiple: true },
				'dev-loop': { type: 'string' },
				issue: { type: 'string' },
				since: { type: 'string' },
				until: { type: 'string' },
				format: { type: 'string' },
				calls: { type: 'boolean' }
			},
			allowPositionals: false
		});
	} catch (e) {
		throw new UserError(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
	}
	const v = parsed.values;
	const format = v.format ?? 'md';
	if (format !== 'md' && format !== 'json')
		throw new UserError(`--format は md か json: ${format}`);
	let issue: number | undefined;
	if (v.issue !== undefined) {
		if (!/^\d+$/.test(v.issue)) throw new UserError(`--issue は数字で指定してください: ${v.issue}`);
		issue = Number(v.issue);
	}
	return {
		dirs: (v.dir?.length ? v.dir : [DEFAULT_SESSION_DIR]).map(expandHome),
		devLoop: v['dev-loop'] === undefined ? undefined : expandHome(v['dev-loop']),
		issue,
		since: checkDate('--since', v.since),
		until: checkDate('--until', v.until),
		format,
		calls: v.calls === true
	};
}

/** `--dev-loop` 省略時の既定: メインのワーキングツリー（worktree 内なら `.claude/worktrees/` より前）の `.dev-loop/`。 */
export function defaultDevLoop(cwd: string): string | undefined {
	const i = cwd.indexOf('/.claude/worktrees/');
	const root = i >= 0 ? cwd.slice(0, i) : cwd;
	const p = join(root, '.dev-loop');
	return existsSync(p) ? p : undefined;
}

/** 集計を実行して出力文字列を返す。読み取り専用。 */
export function run(opts: CliOptions): string {
	const all = [];
	for (const dir of opts.dirs) {
		for (const source of collectSources(dir)) {
			const { records, badLines } = readJsonl(source.path);
			all.push(extractFacts(records, source, badLines, { since: opts.since, until: opts.until }));
		}
	}
	const devLoopPath = opts.devLoop ?? defaultDevLoop(process.cwd());
	const report = aggregate(mergeFacts(all), {
		issue: opts.issue,
		devLoop: devLoopPath ? openDevLoop(devLoopPath) : undefined
	});
	return opts.format === 'json' ? formatJson(report) : formatMarkdown(report, opts.calls);
}

export function main(argv: string[]): number {
	try {
		process.stdout.write(run(parseCliArgs(argv)));
		return 0;
	} catch (e) {
		if (e instanceof UserError) {
			process.stderr.write(`エラー: ${e.message}\n`);
			return 2;
		}
		throw e;
	}
}

/**
 * このファイルが `node cli.ts` で直接実行されたか。
 * `import.meta.main` は Node 22.18 / 24.2 以降にしか無く、無い版では何も出力せず exit 0 になってしまうため、
 * `process.argv[1]` と自身のパスを（シンボリックリンクを解決して）比べる。
 */
export function isDirectRun(argv1: string | undefined, metaUrl: string): boolean {
	if (!argv1) return false;
	try {
		return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
	} catch {
		return false;
	}
}

// 直接実行されたときだけ動く（テストから import しても副作用なし）
if (isDirectRun(process.argv[1], import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
