import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDirectRun, main, parseCliArgs, run, stripLeadingDashes } from './cli.ts';
import { collectSources, normalizeAgent, readJsonl, UserError } from './io.ts';
import { queryCall, resolveCall } from './fixtures/builders.ts';

const dirs: string[] = [];
function tmp(): string {
	const d = mkdtempSync(join(tmpdir(), 'c7-metrics-test-'));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const BRANCH = 'feat/issue-9-synthetic';

describe('引数の解析', () => {
	it('T-18: pnpm が渡す先頭の `--` を無視して引数を解析する（既定ディレクトリに黙って戻らない）', () => {
		expect(stripLeadingDashes(['--', '--dir', 'x'])).toEqual(['--dir', 'x']);
		const opts = parseCliArgs(['--', '--dir', '/some/where', '--issue', '116', '--format', 'json']);
		expect(opts.dirs).toEqual(['/some/where']);
		expect(opts.issue).toBe(116);
		expect(opts.format).toBe('json');
	});
	it('複数の --dir を受け取る', () => {
		expect(parseCliArgs(['--dir', 'a', '--dir', 'b']).dirs).toEqual(['a', 'b']);
	});
	it('不正な値は UserError', () => {
		expect(() => parseCliArgs(['--format', 'xml'])).toThrow(UserError);
		expect(() => parseCliArgs(['--issue', 'abc'])).toThrow(UserError);
		expect(() => parseCliArgs(['--since', '2026/10/01'])).toThrow(UserError);
		expect(() => parseCliArgs(['--unknown'])).toThrow(UserError);
	});
});

describe('ファイル入出力', () => {
	it('存在しないディレクトリは分かりやすいエラーと非ゼロ終了', () => {
		expect(() => collectSources('/no/such/dir-xyz')).toThrow(/見つかりません/);
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		const code = main(['--', '--dir', '/no/such/dir-xyz']);
		const message = stderr.mock.calls.map((c) => String(c[0])).join('');
		stderr.mockRestore();
		expect(code).not.toBe(0);
		expect(message).toContain('見つかりません');
	});

	it('T-9: 壊れた行・途切れた最終行はスキップして件数を返す', () => {
		const d = tmp();
		const p = join(d, 'a.jsonl');
		writeFileSync(
			p,
			`${JSON.stringify(queryCall({ id: 'a', branch: BRANCH }))}\nnot json\n{"truncated":`
		);
		const { records, badLines } = readJsonl(p);
		expect(records).toHaveLength(1);
		expect(badLines).toBe(2);
	});

	it('メインとサブエージェント（meta.json の agentType）の両方を読み、meta 欠落は unknown', () => {
		const d = tmp();
		writeFileSync(
			join(d, 's1.jsonl'),
			JSON.stringify(resolveCall({ id: 'm', branch: BRANCH })) + '\n'
		);
		const sub = join(d, 's1', 'subagents');
		mkdirSync(sub, { recursive: true });
		writeFileSync(
			join(sub, 'agent-aaa.jsonl'),
			JSON.stringify(queryCall({ id: 'g', branch: BRANCH })) + '\n'
		);
		writeFileSync(join(sub, 'agent-aaa.meta.json'), JSON.stringify({ agentType: 'generator' }));
		writeFileSync(
			join(sub, 'agent-bbb.jsonl'),
			JSON.stringify(queryCall({ id: 'x', branch: BRANCH })) + '\n'
		);
		const sources = collectSources(d);
		expect(sources.map((s) => s.agent).sort()).toEqual(['generator', 'main', 'unknown']);
		expect(sources.find((s) => s.agent === 'unknown')?.metaMissing).toBe(true);
	});

	it('旧名の planner（product-spec-planner）は planner にそろえる', () => {
		expect(normalizeAgent('product-spec-planner')).toBe('planner');
		expect(normalizeAgent(undefined)).toBe('unknown');
	});

	it('エンドツーエンド: 一時ディレクトリを集計し、読み取り専用（入力ファイルは変わらない）', () => {
		const d = tmp();
		const text = JSON.stringify(queryCall({ id: 'a', branch: BRANCH })) + '\n';
		writeFileSync(join(d, 's.jsonl'), text);
		const out = run({ dirs: [d], format: 'md', calls: false, devLoop: tmp() });
		expect(out).toContain('| 9 |');
		const json = JSON.parse(run({ dirs: [d], format: 'json', calls: false, devLoop: tmp() })) as {
			issues: unknown[];
		};
		expect(json.issues).toHaveLength(1);
		const empty = run({ dirs: [d], format: 'md', calls: false, devLoop: tmp(), issue: 999 });
		expect(empty).toContain('（該当なし）');
	});
});

describe('直接実行の判定（import.meta.main に依存しない）', () => {
	const cliPath = fileURLToPath(new URL('./cli.ts', import.meta.url));

	it('自身のパスで起動されたときだけ true', () => {
		expect(isDirectRun(cliPath, import.meta.url.replace('cli.test.ts', 'cli.ts'))).toBe(true);
		expect(isDirectRun('/some/other.ts', import.meta.url.replace('cli.test.ts', 'cli.ts'))).toBe(
			false
		);
		expect(isDirectRun(undefined, import.meta.url)).toBe(false);
		expect(isDirectRun('/no/such/file.ts', import.meta.url)).toBe(false);
	});

	it('実際に node で起動すると出力が出る（無出力で exit 0 にならない）', () => {
		const d = tmp();
		writeFileSync(
			join(d, 's.jsonl'),
			JSON.stringify(queryCall({ id: 'a', branch: BRANCH })) + '\n'
		);
		const ok = spawnSync(process.execPath, [cliPath, '--', '--dir', d, '--dev-loop', tmp()], {
			encoding: 'utf8'
		});
		expect(ok.status).toBe(0);
		expect(ok.stdout).toContain('## issue 別');
		const bad = spawnSync(process.execPath, [cliPath, '--dir', '/no/such/dir-xyz'], {
			encoding: 'utf8'
		});
		expect(bad.status).toBe(2);
		expect(bad.stderr).toContain('見つかりません');
	});
});
