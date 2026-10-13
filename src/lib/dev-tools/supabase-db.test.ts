import { describe, expect, it, vi } from 'vite-plus/test';
import {
	MESSAGES,
	SUPABASE_CLI,
	isApproval,
	isInteractive,
	main,
	parseArgs,
	parseDryRunOutput,
	parseEnvFile,
	resolveDatabaseUrl,
	validateDatabaseUrl,
	type Deps
} from './supabase-db';

// issue #128: Supabase CLI wrapper のロジックの単体テスト（実際のCLI・DBは一切使わない）。

const LOCAL_URL = 'postgresql://postgres:pw@127.0.0.1:55432/postgres?sslmode=disable';
const DRY_PENDING =
	'{"upToDate":false,"dryRun":true,"migrations":["1_a.sql"],"message":"Finished"}';
const DRY_UP_TO_DATE = '{"upToDate":true,"dryRun":true,"migrations":[],"message":"up to date"}';

type DepsOverrides = Partial<Deps> & { dryRunStdout?: string; answer?: string | null };

function makeDeps(o: DepsOverrides = {}) {
	const runCli = vi.fn<Deps['runCli']>(async (args) => ({
		code: 0,
		stdout: args.includes('--dry-run') ? (o.dryRunStdout ?? DRY_PENDING) : ''
	}));
	const ask = vi.fn<Deps['ask']>(async () => (o.answer === undefined ? 'y' : o.answer));
	const logs: string[] = [];
	const errors: string[] = [];
	const deps: Deps = {
		processEnv: { DATABASE_URL: LOCAL_URL },
		readDotenv: () => null,
		stdinIsTTY: true,
		stdoutIsTTY: true,
		runCli,
		ask,
		log: (m) => logs.push(m),
		error: (m) => errors.push(m),
		...o
	};
	deps.runCli = o.runCli ?? runCli;
	deps.ask = o.ask ?? ask;
	return { deps, runCli, ask, logs, errors };
}

describe('引数ホワイトリスト', () => {
	it.each([['--yes'], ['--db-url', 'x'], ['--force'], ['foo']])(
		'db:migrate は追加引数(%s)を拒否する',
		(...rest) => {
			expect(parseArgs(['migrate', ...rest]).ok).toBe(false);
		}
	);

	it.each([['--yes'], ['--db-url', 'postgres://x']])(
		'db:status は追加引数(%s)を拒否する',
		(...rest) => {
			expect(parseArgs(['status', ...rest]).ok).toBe(false);
		}
	);

	it('引数なしの migrate / status は受け付ける', () => {
		expect(parseArgs(['migrate'])).toEqual({ ok: true, command: 'migrate' });
		expect(parseArgs(['status'])).toEqual({ ok: true, command: 'status' });
	});

	it('db:new は ^[a-z0-9_]+$ の名前1つだけ受け付ける', () => {
		expect(parseArgs(['new', 'add_users_2'])).toEqual({
			ok: true,
			command: 'new',
			name: 'add_users_2'
		});
	});

	it.each([[''], ['Upper'], ['../x'], ['a b'], ['a-b'], ['x;rm']])(
		'db:new は不正な名前(%j)を拒否する',
		(name) => {
			expect(parseArgs(['new', name]).ok).toBe(false);
		}
	);

	it('db:new は名前なし・複数名を拒否する', () => {
		expect(parseArgs(['new']).ok).toBe(false);
		expect(parseArgs(['new', 'a', 'b']).ok).toBe(false);
	});

	it('未知のサブコマンドを拒否する', () => {
		expect(parseArgs(['push']).ok).toBe(false);
		expect(parseArgs([]).ok).toBe(false);
	});
});

describe('DATABASE_URL の検査', () => {
	it('クォート付き mysql の .env を拒否する（クォートを外した上でスキームを見る）', () => {
		const env = parseEnvFile('DATABASE_URL="mysql://root:pw@localhost:3306/rootist"');
		expect(env.DATABASE_URL).toBe('mysql://root:pw@localhost:3306/rootist');
		expect(validateDatabaseUrl(resolveDatabaseUrl({}, env)).ok).toBe(false);
	});

	it('空文字・未設定を拒否する', () => {
		expect(validateDatabaseUrl('').ok).toBe(false);
		expect(validateDatabaseUrl(undefined).ok).toBe(false);
	});

	it('スキームが無い文字列を拒否する', () => {
		expect(validateDatabaseUrl('localhost:5432/db').ok).toBe(false);
	});

	it('postgresql:// と postgres:// を通す', () => {
		expect(validateDatabaseUrl('postgresql://u:p@h:5432/d').ok).toBe(true);
		expect(validateDatabaseUrl('postgres://u:p@h:5432/d').ok).toBe(true);
	});

	it('エラーメッセージに URL を含めない', () => {
		const result = validateDatabaseUrl('mysql://root:secretpw@localhost/db');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).not.toContain('secretpw');
	});
});

describe('接続先の優先順位と .env のパース', () => {
	const dotenv = { DATABASE_URL: 'postgresql://from-dotenv/db' };

	it('プロセス環境が .env に勝つ', () => {
		expect(resolveDatabaseUrl({ DATABASE_URL: LOCAL_URL }, dotenv)).toBe(LOCAL_URL);
	});

	it('空文字の環境変数も .env の値で上書きされない', () => {
		expect(resolveDatabaseUrl({ DATABASE_URL: '' }, dotenv)).toBe('');
	});

	it('環境変数が存在しないときだけ .env を使う', () => {
		expect(resolveDatabaseUrl({}, dotenv)).toBe('postgresql://from-dotenv/db');
	});

	it('.env のクォート（" / \'）を外し、無いものはそのまま、コメント・空行は無視する', () => {
		const env = parseEnvFile(`# comment

A="double"
B='single'
C=plain
export D = "spaced"
E="unterminated
`);
		expect(env).toMatchObject({ A: 'double', B: 'single', C: 'plain', D: 'spaced' });
		expect(env.E).toBe('"unterminated');
	});
});

describe('端末判定', () => {
	it('stdin と stdout の両方が TTY のときだけ対話可能', () => {
		expect(isInteractive(true, true)).toBe(true);
		expect(isInteractive(false, true)).toBe(false);
		expect(isInteractive(true, false)).toBe(false);
		expect(isInteractive(undefined, undefined)).toBe(false);
	});
});

describe('y/N の判定', () => {
	it.each([['y'], ['yes'], ['YES'], ['Y'], [' yes ']])('%j は承認', (a) => {
		expect(isApproval(a)).toBe(true);
	});
	it.each([[''], ['n'], ['no'], ['yy'], ['yes please'], [null]])('%j は不承認', (a) => {
		expect(isApproval(a)).toBe(false);
	});
});

describe('dry-run 出力の解釈', () => {
	it('upToDate の true / false / 解釈不能を区別する', () => {
		expect(parseDryRunOutput(`DRY RUN\n${DRY_UP_TO_DATE}\n`)).toBe('up_to_date');
		expect(parseDryRunOutput(`DRY RUN\n${DRY_PENDING}\n`)).toBe('pending');
		expect(parseDryRunOutput('something else')).toBe('unknown');
		// 対話端末ではテキスト形式（ANSI装飾つき）で出力される
		expect(
			parseDryRunOutput(
				'DRY RUN: x\nWould push these migrations:\n \u2022 \u001b[1m1_a.sql\u001b[22m\nFinished'
			)
		).toBe('pending');
		expect(parseDryRunOutput('Connecting...\nRemote database is up to date.\n')).toBe('up_to_date');
		expect(parseDryRunOutput('{broken json')).toBe('unknown');
	});
});

describe('db:migrate の流れ', () => {
	it('TTY でなければ CLI を起動せず拒否する（stdin 非TTY）', async () => {
		const { deps, runCli, errors } = makeDeps({ stdinIsTTY: false });
		expect(await main(['migrate'], deps)).not.toBe(0);
		expect(runCli).not.toHaveBeenCalled();
		expect(errors.join('')).toContain('TTY');
	});

	it('拒否の案内は新方式の位置づけ（通常はマージで自動適用・復旧時のみ）を伝える（#138）', () => {
		expect(MESSAGES.notInteractive).toContain('マージで自動適用');
		expect(MESSAGES.notInteractive).toContain('復旧');
	});

	it('TTY でなければ CLI を起動せず拒否する（stdout 非TTY）', async () => {
		const { deps, runCli } = makeDeps({ stdoutIsTTY: false });
		expect(await main(['migrate'], deps)).not.toBe(0);
		expect(runCli).not.toHaveBeenCalled();
	});

	it('CI=1 でも TTY 要件は変わらない（環境変数で迂回できない）', async () => {
		const { deps, runCli } = makeDeps({
			stdinIsTTY: false,
			processEnv: { DATABASE_URL: LOCAL_URL, CI: '1', FORCE: '1', YES: '1' }
		});
		expect(await main(['migrate'], deps)).not.toBe(0);
		expect(runCli).not.toHaveBeenCalled();
	});

	it('--force / --yes 相当の引数を渡しても拒否され CLI は起動しない', async () => {
		for (const extra of [['--force'], ['--yes'], ['-y'], ['--db-url', 'postgres://other/db']]) {
			const { deps, runCli } = makeDeps();
			expect(await main(['migrate', ...extra], deps)).not.toBe(0);
			expect(runCli).not.toHaveBeenCalled();
		}
	});

	it('DATABASE_URL が空・mysql なら CLI を起動せずエラーにする（.env の値で上書きしない）', async () => {
		for (const env of [{ DATABASE_URL: '' }, { DATABASE_URL: 'mysql://root:pw@localhost/db' }]) {
			const { deps, runCli } = makeDeps({
				processEnv: env,
				readDotenv: () => `DATABASE_URL="${LOCAL_URL}"`
			});
			expect(await main(['migrate'], deps)).not.toBe(0);
			expect(runCli).not.toHaveBeenCalled();
		}
	});

	it('適用対象がなければ push を呼ばず正常終了する（確認も取らない）', async () => {
		const { deps, runCli, ask, logs } = makeDeps({ dryRunStdout: DRY_UP_TO_DATE });
		expect(await main(['migrate'], deps)).toBe(0);
		expect(runCli).toHaveBeenCalledTimes(1);
		expect(ask).not.toHaveBeenCalled();
		expect(logs).toContain(MESSAGES.upToDate);
	});

	it('確認文言は接続先を断定せず、接続文字列も含めない', () => {
		expect(MESSAGES.prompt).not.toContain('共有');
		expect(MESSAGES.prompt).not.toMatch(/postgres(ql)?:\/\//);
	});

	it('y の応答でだけ push を起動する', async () => {
		const { deps, runCli, ask, logs } = makeDeps({ answer: 'y' });
		expect(await main(['migrate'], deps)).toBe(0);
		expect(ask).toHaveBeenCalledWith(MESSAGES.prompt);
		expect(runCli).toHaveBeenCalledTimes(2);
		expect(runCli.mock.calls[1][0]).toEqual(['db', 'push', '--db-url', LOCAL_URL]);
		expect(logs).toContain(MESSAGES.approved);
	});

	it.each([[''], ['n'], ['no'], ['yy'], [null]])(
		'応答 %j では push を起動しない',
		async (answer) => {
			const { deps, runCli, logs } = makeDeps({ answer });
			expect(await main(['migrate'], deps)).not.toBe(0);
			expect(runCli).toHaveBeenCalledTimes(1);
			expect(logs).toContain(MESSAGES.cancelled);
		}
	);

	it('dry-run の結果を解釈できなければ push を起動しない', async () => {
		const { deps, runCli, ask } = makeDeps({ dryRunStdout: 'garbage' });
		expect(await main(['migrate'], deps)).not.toBe(0);
		expect(ask).not.toHaveBeenCalled();
		expect(runCli).toHaveBeenCalledTimes(1);
	});

	it('dry-run が失敗したら確認も push もしない', async () => {
		const runCli = vi.fn<Deps['runCli']>(async () => ({ code: 1, stdout: '' }));
		const { deps, ask } = makeDeps({ runCli });
		expect(await main(['migrate'], deps)).toBe(1);
		expect(ask).not.toHaveBeenCalled();
		expect(runCli).toHaveBeenCalledTimes(1);
	});

	it('dry-run の子プロセスは stdin を ignore にする（wrapper の y/N 入力を奪わせない）', async () => {
		const { deps, runCli } = makeDeps();
		await main(['migrate'], deps);
		const [args, options] = runCli.mock.calls[0];
		expect(args).toContain('--dry-run');
		expect(options.stdin).toBe('ignore');
	});

	it('エラーメッセージに接続文字列（パスワード）を含めない', async () => {
		const { deps, errors } = makeDeps({
			processEnv: { DATABASE_URL: 'mysql://root:topsecret@localhost/db' }
		});
		await main(['migrate'], deps);
		expect(errors.join('\n')).not.toContain('topsecret');
	});
});

describe('db:status / db:new', () => {
	it('status は TTY 不要で migration list を --db-url 付きで呼ぶ', async () => {
		const { deps, runCli } = makeDeps({ stdinIsTTY: false, stdoutIsTTY: false });
		expect(await main(['status'], deps)).toBe(0);
		expect(runCli.mock.calls[0][0]).toEqual(['migration', 'list', '--db-url', LOCAL_URL]);
	});

	it('status も DATABASE_URL が空なら CLI を起動しない', async () => {
		const { deps, runCli } = makeDeps({ processEnv: { DATABASE_URL: '' } });
		expect(await main(['status'], deps)).not.toBe(0);
		expect(runCli).not.toHaveBeenCalled();
	});

	it('new は DB に接続せず migration new だけを呼ぶ', async () => {
		const { deps, runCli } = makeDeps({ processEnv: {} });
		expect(await main(['new', 'add_x'], deps)).toBe(0);
		expect(runCli.mock.calls[0][0]).toEqual(['migration', 'new', 'add_x']);
	});
});

describe('子プロセスの起動方法', () => {
	it('CLI のバージョンを固定している', () => {
		expect(SUPABASE_CLI).toMatch(/^supabase@\d+\.\d+\.\d+$/);
	});

	it('入口スクリプトは shell を介さず配列引数で spawn する', async () => {
		const { readFileSync } = await import('node:fs');
		const src = readFileSync(new URL('../../../scripts/supabase-db.mjs', import.meta.url), 'utf8');
		expect(src).toContain("spawn('pnpm', ['dlx', SUPABASE_CLI, ...args]");
		expect(src).not.toMatch(/shell\s*:\s*true/);
		expect(src).not.toMatch(/\bexec(Sync)?\(/);
	});
});
