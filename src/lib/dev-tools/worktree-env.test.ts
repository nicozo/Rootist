import { describe, expect, it } from 'vite-plus/test';
import {
	ALLOWED_KEYS,
	applyKeys,
	auditEnv,
	compareEnv,
	getKey,
	parseIssueNumber,
	parseWorktreeList,
	run,
	tempFileName,
	valuesForIssue,
	type Deps,
	type Result
} from './worktree-env';
import { invalidLineNumbers } from './env-file';

// issue #152: 窓口コマンドの判定ロジック。値（センチネル）が標準出力・標準エラーに出ないことを全機能で確かめる。
// 実入口（scripts/worktree-env.mjs と実 git）の結合は worktree-env.cli.test.ts。

const SENTINEL = 'SENTINEL_152_DO_NOT_LEAK_VALUE';
const MAIN = '/repo';
const WT = '/repo/.claude/worktrees/wt';

/** センチネルが出力のどこかにあれば true。陽性対照のテストでこの検出器自体を確かめる。 */
function leaks(result: Result): boolean {
	return (result.stdout + result.stderr).includes(SENTINEL);
}

type Files = Record<string, string | { link: true }>;

function makeDeps(files: Files, over: Partial<Deps> = {}) {
	const written: Record<string, string> = {};
	const copied: [string, string][] = [];
	const deps: Deps = {
		cwd: WT,
		pid: 4242,
		listWorktrees: () => [MAIN, WT],
		realpath: (path) => path,
		readText: (path) => {
			if (path in written) return written[path];
			const value = files[path];
			return typeof value === 'string' ? value : null;
		},
		isSymlink: (path) => typeof files[path] === 'object',
		copyFile: (from, to) => {
			copied.push([from, to]);
			const value = files[from];
			files[to] = typeof value === 'string' ? value : '';
		},
		writeAtomic: (temp, final, text) => {
			written[final] = text;
			files[final] = text;
			expect(temp).toBe(`${WT}/${tempFileName(4242)}`);
		},
		...over
	};
	return { deps, written, copied, files };
}

const MAIN_ENV = `# comment\nDATABASE_URL=postgres://u:${SENTINEL}@h/db\nGOOGLE_MAPS_API_KEY=${SENTINEL}\nDEV_PORT=5173\n`;

describe('許可リストと値の規則', () => {
	it('許可キーは 2 つだけで、値の規則は docker-worktree.md のとおり', () => {
		expect([...ALLOWED_KEYS]).toEqual(['COMPOSE_PROJECT_NAME', 'DEV_PORT']);
		expect(valuesForIssue(152)).toEqual({
			COMPOSE_PROJECT_NAME: 'rootist-issue-152',
			DEV_PORT: '20152'
		});
	});

	it('issue 番号は 1〜9999 の整数だけ', () => {
		expect(parseIssueNumber('1')).toBe(1);
		expect(parseIssueNumber('9999')).toBe(9999);
		for (const bad of ['0', '10000', '-1', '1.5', 'abc', '', '012', '1 ']) {
			expect(parseIssueNumber(bad)).toBeNull();
		}
	});

	it('一時ファイル名は .env.*.local の形（deny に一致する）', () => {
		expect(tempFileName(123)).toBe('.env.worktree-env-123.local');
		expect(tempFileName(123)).toMatch(/^\.env\..+\.local$/);
	});

	it('git worktree list の出力からパスを取り出す（先頭がメイン）', () => {
		const out = `worktree /a\nHEAD abc\nbranch refs/heads/main\n\nworktree /a/.claude/worktrees/x\nHEAD def\n`;
		expect(parseWorktreeList(out)).toEqual(['/a', '/a/.claude/worktrees/x']);
	});
});

describe('applyKeys', () => {
	const values = valuesForIssue(7);

	it('他の行はバイト一致で保ち、2 キーだけを置換する', () => {
		const text = `# c\r\nA=1\r\nDEV_PORT=5173\r\n\r\nCOMPOSE_PROJECT_NAME=old\nB="x y"`;
		const next = applyKeys(text, values);
		expect(next).toBe(
			`# c\r\nA=1\r\nDEV_PORT=20007\r\n\r\nCOMPOSE_PROJECT_NAME=rootist-issue-7\nB="x y"`
		);
	});

	it('export 付き・クォート付き・重複を各キー 1 回にする', () => {
		const text = `export DEV_PORT=1\nCOMPOSE_PROJECT_NAME="a"\nDEV_PORT=2\nexport COMPOSE_PROJECT_NAME=b\n# DEV_PORT=9\n`;
		const next = applyKeys(text, values);
		const lines = next.split('\n');
		expect(lines.filter((l) => /^(export )?DEV_PORT=/.test(l))).toEqual(['DEV_PORT=20007']);
		expect(lines.filter((l) => /^(export )?COMPOSE_PROJECT_NAME=/.test(l))).toEqual([
			'COMPOSE_PROJECT_NAME=rootist-issue-7'
		]);
		expect(next).toContain('# DEV_PORT=9');
	});

	it('無いキーは末尾に追加し、末尾の改行を保つ', () => {
		expect(applyKeys('A=1\n', values)).toBe(
			'A=1\nCOMPOSE_PROJECT_NAME=rootist-issue-7\nDEV_PORT=20007\n'
		);
		expect(applyKeys('A=1', values)).toBe(
			'A=1\nCOMPOSE_PROJECT_NAME=rootist-issue-7\nDEV_PORT=20007\n'
		);
		expect(applyKeys('', values)).toBe('COMPOSE_PROJECT_NAME=rootist-issue-7\nDEV_PORT=20007\n');
	});

	it('解析できない行も無改変で保持する', () => {
		const text = `garbage-line-without-equals\nA=1\n`;
		expect(applyKeys(text, values).startsWith(text)).toBe(true);
	});
});

describe('getKey（parseEnvFile と同じ解釈）', () => {
	it('export 接頭辞・クォート除去・後勝ち', () => {
		expect(getKey('export DEV_PORT="1"\nDEV_PORT=2\n', 'DEV_PORT')).toEqual({
			state: 'value',
			value: '2'
		});
		expect(getKey("COMPOSE_PROJECT_NAME='x'\n", 'COMPOSE_PROJECT_NAME')).toEqual({
			state: 'value',
			value: 'x'
		});
	});
	it('キー無しと値が空を区別する', () => {
		expect(getKey('A=1\n', 'DEV_PORT')).toEqual({ state: 'absent' });
		expect(getKey('DEV_PORT=\n', 'DEV_PORT')).toEqual({ state: 'value', value: '' });
	});
});

describe('compareEnv', () => {
	it('許可 2 キーだけの差は想定内', () => {
		expect(
			compareEnv('A=1\nDEV_PORT=5173\n', 'A=1\nDEV_PORT=20152\nCOMPOSE_PROJECT_NAME=x\n')
		).toEqual({
			ok: true
		});
	});
	it('他のキーの差と片側のみのキーは差分キー名だけを返す', () => {
		const result = compareEnv(`A=${SENTINEL}\nB=1\n`, `A=other\nC=1\n`);
		expect(result).toEqual({ ok: false, reason: 'keys', keys: ['A', 'B', 'C'] });
		expect(JSON.stringify(result)).not.toContain(SENTINEL);
	});
	it('解析できない行が片方にでもあれば要確認（行番号のみ）', () => {
		const result = compareEnv('A=1\nbroken line\n', 'A=1\n');
		expect(result).toEqual({ ok: false, reason: 'invalid', main: [2], target: [] });
	});
	it('コメント・空行・順序の差は見ない', () => {
		expect(compareEnv('# x\nA=1\nB=2\n', 'B=2\n\nA=1\n')).toEqual({ ok: true });
	});
});

describe('auditEnv', () => {
	it('設定あり / 空 / 無し と、余分なキーの名前だけを返す', () => {
		const result = auditEnv('A=\nB=\nC=\n', `A=${SENTINEL}\nB=\nZ=${SENTINEL}\n`);
		expect(result.keys).toEqual([
			{ key: 'A', state: '設定あり' },
			{ key: 'B', state: '空' },
			{ key: 'C', state: '無し' }
		]);
		expect(result.extra).toEqual(['Z']);
		expect(JSON.stringify(result)).not.toContain(SENTINEL);
	});
});

describe('run: センチネルが出力に出ない', () => {
	const files = (): Files => ({
		[`${MAIN}/.env`]: MAIN_ENV,
		[`${MAIN}/.env.example`]: 'DATABASE_URL=\nGOOGLE_MAPS_API_KEY=\nDEV_PORT=\n',
		[`${WT}/.env`]: `${MAIN_ENV}broken ${SENTINEL} line\n`,
		[`${WT}/.env.example`]: 'DATABASE_URL=\nGOOGLE_MAPS_API_KEY=\nDEV_PORT=\n'
	});

	it('陽性対照: 検出器は、わざと値を出力に含めた結果を検出する', () => {
		expect(leaks({ code: 0, stdout: `x ${SENTINEL}`, stderr: '' })).toBe(true);
		expect(leaks({ code: 1, stdout: '', stderr: `y ${SENTINEL}` })).toBe(true);
		expect(leaks({ code: 0, stdout: 'ok', stderr: '' })).toBe(false);
	});

	it('全サブコマンド・全分岐でセンチネルを出さない', () => {
		const argvs: string[][] = [
			['setup', '152'],
			['setup'],
			['setup', 'abc'],
			['setup', '10000'],
			['setup', '152', '--worktree', MAIN],
			['setup', '152', '--worktree', '/tmp/not-registered'],
			['get', 'DEV_PORT'],
			['get', 'COMPOSE_PROJECT_NAME'],
			['get', 'DATABASE_URL'],
			['get', 'GOOGLE_MAPS_API_KEY'],
			['compare'],
			['audit'],
			['--help'],
			['nope']
		];
		for (const argv of argvs) {
			const { deps } = makeDeps(files());
			const result = run(argv, deps);
			expect(leaks(result), argv.join(' ')).toBe(false);
		}
	});

	it('例外が起きても内容を出さない', () => {
		const { deps } = makeDeps(files(), {
			writeAtomic: () => {
				throw new Error(`boom ${SENTINEL}`);
			}
		});
		const result = run(['setup', '152'], deps);
		expect(result.code).toBe(1);
		expect(leaks(result)).toBe(false);
	});
});

describe('run: setup', () => {
	it('worktree に無ければメインからコピーして 2 キーを設定する（メインは変えない）', () => {
		const { deps, copied, written, files } = makeDeps({ [`${MAIN}/.env`]: MAIN_ENV });
		const result = run(['setup', '152'], deps);
		expect(result.code).toBe(0);
		expect(copied).toEqual([[`${MAIN}/.env`, `${WT}/.env`]]);
		expect(result.stdout).toBe(
			'COMPOSE_PROJECT_NAME=rootist-issue-152\nDEV_PORT=20152\nコピー済み\n'
		);
		expect(written[`${WT}/.env`]).toContain('DEV_PORT=20152');
		expect(written[`${WT}/.env`]).toContain('DATABASE_URL=postgres://');
		expect(files[`${MAIN}/.env`]).toBe(MAIN_ENV);
	});

	it('既存があれば 2 キーだけを置換し、他は変えない', () => {
		const existing = 'MY_LOCAL=1\nDEV_PORT=1\n';
		const { deps, copied, written } = makeDeps({
			[`${MAIN}/.env`]: MAIN_ENV,
			[`${WT}/.env`]: existing
		});
		const result = run(['setup', '152'], deps);
		expect(result.code).toBe(0);
		expect(copied).toEqual([]);
		expect(written[`${WT}/.env`]).toBe(
			'MY_LOCAL=1\nDEV_PORT=20152\nCOMPOSE_PROJECT_NAME=rootist-issue-152\n'
		);
		expect(result.stdout.endsWith('キー設定のみ\n')).toBe(true);
	});

	it('N なしは 2 キーを設定しない（コピーのみ／既存を維持）', () => {
		const a = makeDeps({ [`${MAIN}/.env`]: MAIN_ENV });
		expect(run(['setup'], a.deps).stdout).toBe('コピー済み\n');
		expect(a.written).toEqual({});
		const b = makeDeps({ [`${MAIN}/.env`]: MAIN_ENV, [`${WT}/.env`]: 'A=1\n' });
		expect(run(['setup'], b.deps).stdout).toBe('既存を維持\n');
		expect(b.written).toEqual({});
	});

	it('N が不正・10000 以上なら失敗し何も書かない', () => {
		for (const n of ['0', '10000', '-3', 'x', '1.5']) {
			const { deps, written, copied } = makeDeps({ [`${MAIN}/.env`]: MAIN_ENV });
			const result = run(['setup', n], deps);
			expect(result.code).toBe(1);
			expect(written).toEqual({});
			expect(copied).toEqual([]);
		}
	});

	it('メインに環境ファイルが無ければ失敗し何も作らない', () => {
		const { deps, written, copied } = makeDeps({});
		const result = run(['setup', '152'], deps);
		expect(result.code).toBe(1);
		expect(written).toEqual({});
		expect(copied).toEqual([]);
	});

	it('対象がメイン自身・未登録ディレクトリなら失敗し何も書かない', () => {
		for (const target of [MAIN, '/tmp/not-registered']) {
			const { deps, written, copied } = makeDeps({ [`${MAIN}/.env`]: MAIN_ENV });
			const result = run(['setup', '152', '--worktree', target], deps);
			expect(result.code).toBe(1);
			expect(written).toEqual({});
			expect(copied).toEqual([]);
		}
	});

	it('対象の環境ファイルがシンボリックリンクなら失敗し何も書かない', () => {
		const { deps, written, copied } = makeDeps({
			[`${MAIN}/.env`]: MAIN_ENV,
			[`${WT}/.env`]: { link: true }
		});
		const result = run(['setup', '152'], deps);
		expect(result.code).toBe(1);
		expect(written).toEqual({});
		expect(copied).toEqual([]);
	});

	it('git worktree list が取れなければ失敗する', () => {
		const { deps } = makeDeps({ [`${MAIN}/.env`]: MAIN_ENV }, { listWorktrees: () => null });
		expect(run(['setup', '152'], deps).code).toBe(1);
	});
});

describe('run: get / compare / audit', () => {
	it('get: 許可リスト外は値を出さず終了コード 2', () => {
		const { deps } = makeDeps({ [`${WT}/.env`]: MAIN_ENV });
		const result = run(['get', 'GOOGLE_MAPS_API_KEY'], deps);
		expect(result.code).toBe(2);
		expect(result.stdout).toBe('');
		expect(leaks(result)).toBe(false);
	});

	it('get: 値あり 0（値のみ）／キー無し 3（標準エラーに「未設定」）／値が空 0', () => {
		const { deps } = makeDeps({ [`${WT}/.env`]: 'DEV_PORT=20152\nCOMPOSE_PROJECT_NAME=\n' });
		expect(run(['get', 'DEV_PORT'], deps)).toEqual({ code: 0, stdout: '20152\n', stderr: '' });
		expect(run(['get', 'COMPOSE_PROJECT_NAME'], deps)).toEqual({
			code: 0,
			stdout: '\n',
			stderr: ''
		});
		const absent = makeDeps({ [`${WT}/.env`]: 'A=1\n' });
		expect(run(['get', 'DEV_PORT'], absent.deps)).toEqual({
			code: 3,
			stdout: '',
			stderr: '未設定\n'
		});
	});

	it('compare: 想定内（2 キーだけ違う）／要確認（他キー）', () => {
		const ok = makeDeps({
			[`${MAIN}/.env`]: 'A=1\nDEV_PORT=5173\n',
			[`${WT}/.env`]: 'A=1\nDEV_PORT=20152\nCOMPOSE_PROJECT_NAME=rootist-issue-152\n'
		});
		expect(run(['compare'], ok.deps)).toEqual({ code: 0, stdout: '想定内\n', stderr: '' });
		const ng = makeDeps({
			[`${MAIN}/.env`]: `A=${SENTINEL}\n`,
			[`${WT}/.env`]: `A=changed\nMINE=1\n`
		});
		const result = run(['compare'], ng.deps);
		expect(result).toEqual({ code: 1, stdout: '要確認\n差分キー: A, MINE\n', stderr: '' });
	});

	it('compare: 解析できない行だけが違っても要確認（行番号のみ）', () => {
		const { deps } = makeDeps({
			[`${MAIN}/.env`]: 'A=1\n',
			[`${WT}/.env`]: `A=1\nthis ${SENTINEL} is broken\n`
		});
		const result = run(['compare'], deps);
		expect(result.code).toBe(1);
		expect(result.stdout).toBe('要確認\n解析できない行: メイン なし / 対象 2（行番号）\n');
		expect(leaks(result)).toBe(false);
	});

	it('audit: キー名と状態だけ', () => {
		const { deps } = makeDeps({
			[`${WT}/.env`]: `A=${SENTINEL}\nB=\nEXTRA=${SENTINEL}\n`,
			[`${WT}/.env.example`]: 'A=\nB=\nC=\n'
		});
		const result = run(['audit'], deps);
		expect(result).toEqual({
			code: 0,
			stdout: 'A: 設定あり\nB: 空\nC: 無し\n余分なキー: EXTRA\n',
			stderr: ''
		});
	});
});

describe('env-file: 解釈できない行の検出', () => {
	it('空行・コメント以外で KEY=VALUE にならない行の行番号だけを返す', () => {
		expect(invalidLineNumbers('A=1\n\n# c\nnope\nB=2\n= x\n')).toEqual([4, 6]);
	});
});
