// issue #128: Supabase CLI（マイグレーション）を安全に呼ぶ wrapper のロジック。入口は scripts/supabase-db.mjs。
//
// 制約:
// - SvelteKit の仮想モジュール（$lib / $env / $app）を import しない。scripts/supabase-db.mjs から
//   Node の型除去でそのまま実行できる構文（enum / parameter properties / namespace を使わない）だけで書く。
// - 副作用（子プロセス起動・標準入出力・ファイル読み込み）は Deps として注入する（テストでモックする）。
//
// このガードは「誤操作を防ぐ仕組み」でありセキュリティ境界ではない。疑似端末（script コマンド等）を作る、
// `pnpm dlx supabase@... db push` を直接叩く、で迂回できる（docs/supabase-setup.md）。

export const SUPABASE_CLI = 'supabase@2.119.0';

export type Command = 'new' | 'migrate' | 'status';

export type ParsedArgs =
	| { ok: true; command: Command; name?: string }
	| { ok: false; error: string };

/** 引数ホワイトリスト。migrate / status は追加引数を一切受け付けず、new は名前1つだけ。 */
export function parseArgs(argv: string[]): ParsedArgs {
	const [command, ...rest] = argv;
	if (command === 'migrate' || command === 'status') {
		if (rest.length > 0) {
			return { ok: false, error: `db:${command} は追加の引数を受け付けません` };
		}
		return { ok: true, command };
	}
	if (command === 'new') {
		if (rest.length !== 1) {
			return { ok: false, error: 'db:new はマイグレーション名を1つだけ指定してください' };
		}
		const name = rest[0];
		if (!/^[a-z0-9_]+$/.test(name)) {
			return { ok: false, error: 'マイグレーション名は英小文字・数字・アンダースコアのみ使えます' };
		}
		return { ok: true, command, name };
	}
	return { ok: false, error: 'サブコマンドは new / migrate / status のいずれかです' };
}

/** .env の内容から KEY=VALUE を取り出す。値の前後の対のクォート（" または '）を外す。 */
export function parseEnvFile(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) continue;
		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (!match) continue;
		let value = match[2].trim();
		if (value.length >= 2) {
			const first = value[0];
			if ((first === '"' || first === "'") && value.endsWith(first)) value = value.slice(1, -1);
		}
		result[match[1]] = value;
	}
	return result;
}

/**
 * 接続先の解決。プロセス環境に定義済みの値（空文字を含む）が .env より優先する。
 * .env の値は、プロセス環境に DATABASE_URL が存在しないときだけ使う。
 */
export function resolveDatabaseUrl(
	processEnv: Record<string, string | undefined>,
	dotenv: Record<string, string>
): string | undefined {
	if (Object.prototype.hasOwnProperty.call(processEnv, 'DATABASE_URL')) {
		return processEnv.DATABASE_URL;
	}
	return dotenv.DATABASE_URL;
}

export type UrlCheck = { ok: true } | { ok: false; error: string };

/** URLの全文はエラーに含めない。 */
export function validateDatabaseUrl(url: string | undefined): UrlCheck {
	if (url === undefined || url === '') {
		return {
			ok: false,
			error: 'DATABASE_URL が未設定または空です（.env か環境変数で指定してください）'
		};
	}
	if (!/^postgres(ql)?:\/\//.test(url)) {
		return {
			ok: false,
			error:
				'DATABASE_URL が postgres:// または postgresql:// で始まっていません（旧 mysql:// のままでは？）'
		};
	}
	return { ok: true };
}

/** 実適用は対話端末（stdin と stdout の両方が TTY）でのみ許可する。 */
export function isInteractive(stdinIsTTY: boolean | undefined, stdoutIsTTY: boolean | undefined) {
	return stdinIsTTY === true && stdoutIsTTY === true;
}

/** y / yes（大文字小文字無視）だけを承認とする。EOF（null）・空・その他は不承認。 */
export function isApproval(answer: string | null): boolean {
	if (answer === null) return false;
	const a = answer.trim().toLowerCase();
	return a === 'y' || a === 'yes';
}

export type DryRunResult = 'up_to_date' | 'pending' | 'unknown';

/**
 * `supabase db push --dry-run` の出力を解釈する。解釈できなければ unknown（その場合は適用しない）。
 * CLI は端末の有無で出力形式が変わる（実測: 非TTYでは最終行にJSON `{"upToDate":...}`、
 * 対話端末では "Would push these migrations:" / "Remote database is up to date." のテキスト）ため両方を見る。
 */
export function parseDryRunOutput(stdout: string): DryRunResult {
	// eslint-disable-next-line no-control-regex
	const text = stdout.replace(/\u001b\[[0-9;]*m/g, '');
	for (const line of text.split(/\r?\n/).reverse()) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('{')) continue;
		try {
			const parsed = JSON.parse(trimmed) as { upToDate?: unknown };
			if (parsed.upToDate === true) return 'up_to_date';
			if (parsed.upToDate === false) return 'pending';
		} catch {
			// 次の行を試す
		}
	}
	if (/Remote database is up to date/i.test(text)) return 'up_to_date';
	if (/Would push these migrations/i.test(text)) return 'pending';
	return 'unknown';
}

export type RunOptions = {
	/** 子プロセスの stdin。dry-run は 'ignore'（wrapper 自身の y/N 入力を奪わせない） */
	stdin: 'ignore' | 'inherit';
	/** true なら stdout と stderr を取得して（結合して）返す。同時に端末にも流す */
	capture: boolean;
};

export type Deps = {
	processEnv: Record<string, string | undefined>;
	/** .env の内容。無ければ null */
	readDotenv: () => string | null;
	stdinIsTTY: boolean | undefined;
	stdoutIsTTY: boolean | undefined;
	/** shell を介さず、引数を配列で渡して `pnpm dlx supabase@x.y.z ...args` を実行する */
	runCli: (args: string[], options: RunOptions) => Promise<{ code: number; stdout: string }>;
	/** 1行読む。EOF なら null */
	ask: (prompt: string) => Promise<string | null>;
	log: (message: string) => void;
	error: (message: string) => void;
};

export const MESSAGES = {
	prompt: '上記のマイグレーションを接続先の DB に適用しますか？ [y/N]: ',
	cancelled: 'キャンセルしました。何も適用していません。',
	approved: '承認されました。supabase db push を実行します。',
	upToDate: '適用対象のマイグレーションはありません。何も実行しません。',
	notInteractive:
		'db:migrate は対話端末（TTY）でのみ実行できます。ユーザー自身の端末で実行してください（エージェントからは実行しない）。'
} as const;

/** 終了コードを返す。 */
export async function main(argv: string[], deps: Deps): Promise<number> {
	const parsed = parseArgs(argv);
	if (!parsed.ok) {
		deps.error(parsed.error);
		return 2;
	}

	if (parsed.command === 'new') {
		// ローカルにファイルを作るだけ。DB には接続しない
		const { code } = await deps.runCli(['migration', 'new', parsed.name as string], {
			stdin: 'ignore',
			capture: false
		});
		return code;
	}

	if (parsed.command === 'migrate' && !isInteractive(deps.stdinIsTTY, deps.stdoutIsTTY)) {
		deps.error(MESSAGES.notInteractive);
		return 3;
	}

	const dotenvText = deps.readDotenv();
	const url = resolveDatabaseUrl(
		deps.processEnv,
		dotenvText === null ? {} : parseEnvFile(dotenvText)
	);
	const check = validateDatabaseUrl(url);
	if (!check.ok) {
		deps.error(check.error);
		return 4;
	}
	const dbUrl = url as string;

	if (parsed.command === 'status') {
		const { code } = await deps.runCli(['migration', 'list', '--db-url', dbUrl], {
			stdin: 'ignore',
			capture: false
		});
		return code;
	}

	// migrate: dry-run → 適用対象なしなら終了 → wrapper 自身が y/N → push
	const dry = await deps.runCli(['db', 'push', '--dry-run', '--db-url', dbUrl], {
		stdin: 'ignore',
		capture: true
	});
	if (dry.code !== 0) {
		deps.error('dry-run が失敗しました。何も適用していません。');
		return dry.code;
	}
	const result = parseDryRunOutput(dry.stdout);
	if (result === 'up_to_date') {
		deps.log(MESSAGES.upToDate);
		return 0;
	}
	if (result === 'unknown') {
		deps.error('dry-run の結果を解釈できませんでした。何も適用していません。');
		return 5;
	}

	const answer = await deps.ask(MESSAGES.prompt);
	if (!isApproval(answer)) {
		deps.log(MESSAGES.cancelled);
		return 1;
	}
	deps.log(MESSAGES.approved);
	const push = await deps.runCli(['db', 'push', '--db-url', dbUrl], {
		stdin: 'inherit',
		capture: false
	});
	return push.code;
}
