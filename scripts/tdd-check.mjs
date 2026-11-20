// issue #181: `pnpm -s tdd-check <テストのコミット> --base <ベース>` の入口。dev-loop の検証の段で使う。
// 判定ロジックは src/lib/dev-tools/tdd-check.ts（単体テスト済み）にあり、ここは git とテスト実行の副作用だけを持つ。
// git はホストで、テストは CLAUDE.md のとおり tools コンテナで実行する（worktree の .git はホストの絶対パスを指すため）。
// テストのコミットの時点のテストを流すため、作業ツリーを一時的にそのコミットへ切り替え、終わったら必ず元のブランチに戻す。
//
// 終了コード: 0 = TDD を満たす / 1 = 違反あり（dev-loop は Generator に差し戻す） / 2 = 使い方・前提の誤り
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import {
	checkE2e,
	checkGreen,
	checkNotWeakened,
	checkOrder,
	checkRed,
	checkTestCommit,
	formatResult,
	isE2eTest,
	isUnitTest,
	parseNameStatus
} from '../src/lib/dev-tools/tdd-check.ts';

const CONTAINER_ROOT = '/app';
const REPORT_DIR = '.tdd-check';

function git(args) {
	const result = spawnSync('git', args, { encoding: 'utf8' });
	return {
		ok: result.status === 0,
		out: (result.stdout ?? '').trim(),
		err: (result.stderr ?? '').trim()
	};
}

function fail(message) {
	process.stderr.write(`tdd-check: ${message}\n`);
	process.exit(2);
}

function usage() {
	return 'usage: pnpm -s tdd-check <テストのコミット> --base <ベースのブランチ・コミット>\n';
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	process.stdout.write(usage());
	process.exit(0);
}
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
const testRef = args.find((arg, i) => !arg.startsWith('--') && i !== baseIndex + 1);
if (!testRef || !base) {
	process.stderr.write(usage());
	process.exit(2);
}

const resolve = (ref) => {
	const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
	if (!r.ok) fail(`コミットが見つからない: ${ref}`);
	return r.out;
};
const baseSha = resolve(base);
const testSha = resolve(testRef);
const headSha = resolve('HEAD');
const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
if (!branch.ok) fail('ブランチ上で実行する（detached HEAD では元に戻せない）');
if (git(['status', '--porcelain', '--untracked-files=no']).out !== '') {
	fail('作業ツリーに未コミットの変更がある。コミットしてから実行する');
}
if (testSha === headSha) fail('テストのコミットが最新のコミットと同じ（実装のコミットが無い）');
if (!git(['merge-base', '--is-ancestor', baseSha, testSha]).ok)
	fail('テストのコミットがベースより後にない');
if (!git(['merge-base', '--is-ancestor', testSha, headSha]).ok)
	fail('テストのコミットが現在のブランチに含まれていない');

// 静的な確認（順序・テストのコミットの中身・緩めた跡）
const violations = [];
const before = git(['diff', '--name-only', baseSha, `${testSha}^`]);
violations.push(...checkOrder(before.out.split('\n').filter(Boolean)));
const changes = parseNameStatus(git(['diff', '--name-status', `${testSha}^`, testSha]).out);
violations.push(...checkTestCommit(changes));
const testFiles = changes.filter((c) => c.status !== 'D').map((c) => c.path);
if (testFiles.length > 0) {
	violations.push(...checkNotWeakened(git(['diff', testSha, headSha, '--', ...testFiles]).out));
}
if (violations.length > 0) {
	process.stdout.write(formatResult(violations));
	process.exit(1);
}

const unitFiles = testFiles.filter(isUnitTest);
const e2eFiles = testFiles.filter(isE2eTest);

function runUnit(label) {
	if (unitFiles.length === 0) return { testResults: [] };
	const outputFile = `${REPORT_DIR}/${label}.json`;
	// 前回の実行が途中で落ちて残ったレポートを、今回の結果として読まないように消してから流す
	rmSync(outputFile, { force: true });
	spawnSync(
		'docker',
		[
			'compose',
			'run',
			'--rm',
			'tools',
			'pnpm',
			'test:unit',
			'--',
			'--run',
			'--reporter=json',
			`--outputFile=${outputFile}`,
			...unitFiles
		],
		{ stdio: ['ignore', 'ignore', 'inherit'] }
	);
	try {
		return JSON.parse(readFileSync(outputFile, 'utf8'));
	} catch {
		return { testResults: [] }; // レポートが無い＝実行されなかった。checkRed / checkGreen が「実行されなかった」として扱う
	}
}

function runE2e() {
	if (e2eFiles.length === 0) return 0;
	const r = spawnSync(
		'docker',
		['compose', 'run', '--rm', 'tools', 'pnpm', 'test:e2e', '--', ...e2eFiles],
		{
			stdio: ['ignore', 'ignore', 'inherit']
		}
	);
	return r.status ?? 1;
}

// RED: テストのコミットの時点に切り替えて流す。失敗しても必ず元のブランチへ戻す
let redReport;
let redE2e;
const checkout = git(['checkout', '--quiet', '--detach', testSha]);
if (!checkout.ok) fail(`テストのコミットに切り替えられない: ${checkout.err}`);
try {
	redReport = runUnit('red');
	redE2e = runE2e();
} finally {
	const back = git(['checkout', '--quiet', branch.out]);
	if (!back.ok)
		fail(
			`元のブランチ ${branch.out} に戻せない。手で git checkout ${branch.out} する: ${back.err}`
		);
}
violations.push(
	...checkRed(redReport, unitFiles, CONTAINER_ROOT),
	...checkE2e(redE2e, e2eFiles, 'red')
);

// GREEN: 最新の時点で流す
const greenReport = runUnit('green');
violations.push(
	...checkGreen(greenReport, unitFiles, CONTAINER_ROOT),
	...checkE2e(runE2e(), e2eFiles, 'green')
);

rmSync(REPORT_DIR, { recursive: true, force: true });
process.stdout.write(formatResult(violations));
process.exit(violations.length === 0 ? 0 : 1);
