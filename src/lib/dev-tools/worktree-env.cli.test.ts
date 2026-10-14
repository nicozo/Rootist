import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

// issue #152: 実入口（scripts/worktree-env.mjs）と実 git での結合テスト。使い捨ての git リポジトリを
// os.tmpdir() に作り、リポジトリ自身の環境ファイルは一切読まない。

const SENTINEL = 'SENTINEL_152_CLI_DO_NOT_LEAK';
const script = join(process.cwd(), 'scripts/worktree-env.mjs');

let root: string;
let main: string;
let wt: string;

function git(cwd: string, ...args: string[]) {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
}

function cli(cwd: string, ...args: string[]) {
	const result = spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' });
	return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const MAIN_ENV = `# c\nDATABASE_URL=postgres://u:${SENTINEL}@h/db\nKEY_A=${SENTINEL}\nDEV_PORT=5173\n`;

beforeAll(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-env-cli-')));
	main = join(root, 'repo');
	mkdirSync(main);
	git(main, 'init', '-q', '-b', 'main');
	git(main, 'config', 'user.email', 't@example.invalid');
	git(main, 'config', 'user.name', 't');
	writeFileSync(join(main, 'README.md'), 'x\n');
	writeFileSync(join(main, '.env.example'), 'DATABASE_URL=\nKEY_A=\nDEV_PORT=\n');
	git(main, 'add', 'README.md', '.env.example');
	git(main, 'commit', '-q', '-m', 'init');
	wt = join(main, '.claude/worktrees/wt');
	git(main, 'worktree', 'add', '-q', '-b', 'wt', wt);
	writeFileSync(join(main, '.env'), MAIN_ENV, { mode: 0o600 });
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('worktree-env 実入口', () => {
	it('--help はコマンドの使い方を出す', () => {
		const result = cli(main, '--help');
		expect(result.code).toBe(0);
		expect(result.stdout).toContain('setup');
	});

	it('setup: コピーして 2 キーを設定し、センチネルを出力しない。メインは変わらない', () => {
		const result = cli(wt, 'setup', '152');
		expect(result.code).toBe(0);
		expect(result.stdout).toBe(
			'COMPOSE_PROJECT_NAME=rootist-issue-152\nDEV_PORT=20152\nコピー済み\n'
		);
		expect(result.stdout + result.stderr).not.toContain(SENTINEL);
		const text = readFileSync(join(wt, '.env'), 'utf8');
		expect(text).toContain(`KEY_A=${SENTINEL}`);
		expect(text).toContain('DEV_PORT=20152');
		expect(readFileSync(join(main, '.env'), 'utf8')).toBe(MAIN_ENV);
		expect(lstatSync(join(wt, '.env')).mode & 0o777).toBe(0o600);
		// 一時ファイルが残らない
		expect(readdirSync(wt).filter((n) => n.startsWith('.env.worktree-env-'))).toEqual([]);
	});

	it('get / compare / audit が値を出さずに答える', () => {
		expect(cli(wt, 'get', 'DEV_PORT')).toEqual({ code: 0, stdout: '20152\n', stderr: '' });
		const denied = cli(wt, 'get', 'KEY_A');
		expect(denied.code).toBe(2);
		expect(denied.stdout + denied.stderr).not.toContain(SENTINEL);
		expect(cli(wt, 'compare')).toEqual({ code: 0, stdout: '想定内\n', stderr: '' });
		const audit = cli(wt, 'audit');
		expect(audit.stdout).toBe(
			'DATABASE_URL: 設定あり\nKEY_A: 設定あり\nDEV_PORT: 設定あり\n余分なキー: COMPOSE_PROJECT_NAME\n'
		);
		expect(audit.stdout + audit.stderr).not.toContain(SENTINEL);
	});

	it('compare: 他のキーが違えば要確認（キー名だけ）', () => {
		writeFileSync(join(wt, '.env'), readFileSync(join(wt, '.env'), 'utf8') + 'MINE=1\n');
		const result = cli(wt, 'compare');
		expect(result).toEqual({ code: 1, stdout: '要確認\n差分キー: MINE\n', stderr: '' });
	});

	it('setup: メイン自身と未登録ディレクトリは失敗し何も書かない', () => {
		const stray = join(root, 'stray');
		mkdirSync(stray);
		const a = cli(wt, 'setup', '152', '--worktree', main);
		expect(a.code).toBe(1);
		const b = cli(wt, 'setup', '152', '--worktree', stray);
		expect(b.code).toBe(1);
		expect(existsSync(join(stray, '.env'))).toBe(false);
		expect(readFileSync(join(main, '.env'), 'utf8')).toBe(MAIN_ENV);
		expect(a.stdout + a.stderr + b.stdout + b.stderr).not.toContain(SENTINEL);
	});

	it('setup: 対象の環境ファイルがシンボリックリンクなら失敗する', () => {
		const wt2 = join(main, '.claude/worktrees/wt2');
		git(main, 'worktree', 'add', '-q', '-b', 'wt2', wt2);
		symlinkSync(join(main, '.env'), join(wt2, '.env'));
		const result = cli(wt2, 'setup', '153');
		expect(result.code).toBe(1);
		expect(readFileSync(join(main, '.env'), 'utf8')).toBe(MAIN_ENV);
	});

	it('ディレクトリが消えた worktree の登録（prunable）があっても、他の worktree は使える', () => {
		const gone = join(main, '.claude/worktrees/gone');
		git(main, 'worktree', 'add', '-q', '-b', 'gone', gone);
		rmSync(gone, { recursive: true, force: true });
		expect(cli(wt, 'get', 'DEV_PORT')).toEqual({ code: 0, stdout: '20152\n', stderr: '' });
	});

	it('書き込みに失敗したら終了コード 1 で、一時ファイルを残さず、センチネルを出さない', () => {
		const wt3 = join(main, '.claude/worktrees/wt3');
		git(main, 'worktree', 'add', '-q', '-b', 'wt3', wt3);
		writeFileSync(join(wt3, '.env'), `A=${SENTINEL}\n`, { mode: 0o600 });
		chmodSync(wt3, 0o555); // ディレクトリを読み取り専用にして、一時ファイルの作成を失敗させる
		try {
			const result = cli(wt3, 'setup', '154');
			expect(result.code).toBe(1);
			expect(result.stdout + result.stderr).not.toContain(SENTINEL);
			expect(readdirSync(wt3).filter((n) => n.startsWith('.env.worktree-env-'))).toEqual([]);
			expect(readFileSync(join(wt3, '.env'), 'utf8')).toBe(`A=${SENTINEL}\n`);
		} finally {
			chmodSync(wt3, 0o755);
		}
	});

	it('git リポジトリの外では失敗する', () => {
		const outside = mkdtempSync(join(tmpdir(), 'worktree-env-out-'));
		try {
			const result = cli(outside, 'get', 'DEV_PORT');
			expect(result.code).toBe(2);
			expect(result.stdout).toBe('');
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});
});
