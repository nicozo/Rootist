import { describe, expect, it } from 'vite-plus/test';
import {
	checkE2e,
	checkGreen,
	checkNotWeakened,
	checkOrder,
	checkRed,
	checkTestCommit,
	formatResult,
	isE2eTest,
	isTestFile,
	isUnitTest,
	parseNameStatus,
	testRangeChanges
} from './tdd-check';

// issue #181: dev-loop の TDD 確認の判定ロジック。git とコンテナの実行は入口（scripts/tdd-check.mjs）が持つ。

describe('isTestFile / isUnitTest / isE2eTest', () => {
	it.each([
		['src/lib/server/plan.test.ts', true, true, false],
		['src/routes/page.svelte.test.ts', true, true, false],
		['scripts/node-version.test.ts', true, true, false],
		['e2e/plan.test.ts', true, false, true],
		['e2e/helpers.ts', true, false, false],
		['src/lib/server/test-utils/mock-env.ts', true, false, false],
		['scripts/context7-metrics/fixtures/a.md', true, false, false],
		['src/lib/server/plan.ts', false, false, false],
		['src/routes/+page.svelte', false, false, false],
		['specs/issue-1-x/spec.md', false, false, false]
	])('%s → test=%s unit=%s e2e=%s', (path, test, unit, e2e) => {
		expect(isTestFile(path)).toBe(test);
		expect(isUnitTest(path)).toBe(unit);
		expect(isE2eTest(path)).toBe(e2e);
	});
});

describe('parseNameStatus', () => {
	it('状態の先頭 1 文字と、リネームなら新しい側のパスを返す', () => {
		expect(parseNameStatus('A\ta.test.ts\nM\tb.ts\nR100\told.test.ts\tnew.test.ts\n')).toEqual([
			{ status: 'A', path: 'a.test.ts' },
			{ status: 'M', path: 'b.ts' },
			{ status: 'R', path: 'new.test.ts' }
		]);
	});

	it('空の出力は空の配列', () => {
		expect(parseNameStatus('')).toEqual([]);
	});
});

describe('checkOrder', () => {
	it('テストより前の変更が spec とテストだけなら違反なし', () => {
		expect(
			checkOrder(['specs/issue-1-x/spec.md', 'specs/issue-1-x/plan.md', 'e2e/helpers.ts'])
		).toEqual([]);
	});

	it('テストより前に実装が変わっていれば違反', () => {
		expect(checkOrder(['specs/issue-1-x/spec.md', 'src/lib/server/plan.ts'])).toEqual([
			'テストのコミットより前に実装が変わっている: src/lib/server/plan.ts'
		]);
	});
});

describe('testRangeChanges', () => {
	// issue #190: 実装より前なら、テストの直しは追加のテストだけのコミットで行う（履歴を書き換えない）。
	// ベース〜最後のテストだけのコミットの差分から spec を除いたものを「テストのコミット」の中身として扱う
	it('ベース〜テストのコミットの差分から spec を除く', () => {
		expect(
			testRangeChanges([
				{ status: 'A', path: 'specs/issue-1-x/spec.md' },
				{ status: 'A', path: 'src/lib/server/plan.test.ts' },
				{ status: 'M', path: 'e2e/plan.test.ts' }
			])
		).toEqual([
			{ status: 'A', path: 'src/lib/server/plan.test.ts' },
			{ status: 'M', path: 'e2e/plan.test.ts' }
		]);
	});

	it('実装が混ざっていれば残し、checkTestCommit で違反になる', () => {
		const changes = testRangeChanges([
			{ status: 'M', path: 'specs/issue-1-x/tasks.md' },
			{ status: 'A', path: 'src/lib/server/plan.test.ts' },
			{ status: 'M', path: 'src/lib/server/plan.ts' }
		]);
		expect(checkTestCommit(changes)).toEqual([
			'テストのコミットにテスト以外の変更がある: src/lib/server/plan.ts'
		]);
	});
});

describe('checkTestCommit', () => {
	it('テストの追加・変更だけなら違反なし', () => {
		expect(
			checkTestCommit([
				{ status: 'A', path: 'src/lib/server/plan.test.ts' },
				{ status: 'M', path: 'e2e/helpers.ts' }
			])
		).toEqual([]);
	});

	it('空のコミットは違反', () => {
		expect(checkTestCommit([])).toEqual(['テストのコミットに変更が無い']);
	});

	it('実装が混ざっていれば違反', () => {
		expect(
			checkTestCommit([
				{ status: 'A', path: 'src/lib/server/plan.test.ts' },
				{ status: 'M', path: 'src/lib/server/plan.ts' }
			])
		).toEqual(['テストのコミットにテスト以外の変更がある: src/lib/server/plan.ts']);
	});

	it('テストの削除は違反', () => {
		expect(
			checkTestCommit([
				{ status: 'A', path: 'src/a.test.ts' },
				{ status: 'D', path: 'src/b.test.ts' }
			])
		).toEqual(['テストのコミットでテストを削除している: src/b.test.ts']);
	});

	it('共通処理だけで実行できるテストが無ければ違反', () => {
		expect(checkTestCommit([{ status: 'M', path: 'e2e/helpers.ts' }])).toEqual([
			'テストのコミットに実行できるテスト（*.test.ts / e2e/）が無い'
		]);
	});
});

describe('checkNotWeakened', () => {
	const header = (file: string) =>
		`diff --git a/${file} b/${file}\nindex 1..2 100644\n--- a/${file}\n+++ b/${file}\n@@ -1,3 +1,4 @@\n`;

	it('差分が無ければ違反なし', () => {
		expect(checkNotWeakened('')).toEqual([]);
	});

	it('テストを足すだけなら違反なし', () => {
		const diff = `${header('src/a.test.ts')} 	it('a', () => {});\n+	it('b', () => {\n+		expect(1).toBe(1);\n+	});\n`;
		expect(checkNotWeakened(diff)).toEqual([]);
	});

	it('期待値の書き換え（削除行）は違反', () => {
		const diff = `${header('src/a.test.ts')}-		expect(total).toBe(3);\n+		expect(total).toBe(2);\n`;
		expect(checkNotWeakened(diff)).toEqual([
			'テストのコミットの後でテストの行を消している・書き換えている: src/a.test.ts: expect(total).toBe(3);'
		]);
	});

	it.each([
		"+	it.skip('a', () => {});",
		"+	it.todo('a');",
		"+	describe.only('x', () => {});",
		"+	xit('a', () => {});"
	])('無効化の追加は違反: %s', (added) => {
		const result = checkNotWeakened(`${header('src/a.test.ts')}${added}\n`);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatch(/^テストのコミットの後でテストを無効化している: src\/a\.test\.ts: /);
	});

	it('ファイルの削除は違反', () => {
		const diff =
			'diff --git a/src/a.test.ts b/src/a.test.ts\ndeleted file mode 100644\nindex 1..0\n--- a/src/a.test.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n';
		expect(checkNotWeakened(diff)).toContain(
			'テストのコミットの後でテストを削除している: src/a.test.ts'
		);
	});
});

describe('checkRed / checkGreen', () => {
	const report = {
		testResults: [
			{ name: '/app/src/a.test.ts', status: 'failed' },
			{ name: '/app/src/b.test.ts', status: 'passed' }
		]
	};

	it('RED: 失敗していれば違反なし', () => {
		expect(checkRed(report, ['src/a.test.ts'], '/app')).toEqual([]);
	});

	it('RED: 通っている・実行されていないテストは違反', () => {
		expect(checkRed(report, ['src/b.test.ts', 'src/c.test.ts'], '/app')).toEqual([
			'テストのコミットの時点で失敗していない（実装より先に書かれたテストになっていない）: src/b.test.ts',
			'テストのコミットの時点で実行されなかった: src/c.test.ts'
		]);
	});

	it('GREEN: 通っていれば違反なし', () => {
		expect(checkGreen(report, ['src/b.test.ts'], '/app/')).toEqual([]);
	});

	it('GREEN: 失敗・実行されていないテストは違反。レポートが空でも同じ', () => {
		expect(checkGreen(report, ['src/a.test.ts'], '/app')).toEqual([
			'最新の時点で通っていない: src/a.test.ts'
		]);
		expect(checkGreen({}, ['src/a.test.ts'], '/app')).toEqual([
			'最新の時点で実行されなかった: src/a.test.ts'
		]);
	});
});

describe('checkE2e', () => {
	it('E2E が無ければ常に違反なし', () => {
		expect(checkE2e(0, [], 'red')).toEqual([]);
	});

	it('RED は失敗（0 以外）、GREEN は成功（0）を求める', () => {
		expect(checkE2e(1, ['e2e/a.test.ts'], 'red')).toEqual([]);
		expect(checkE2e(0, ['e2e/a.test.ts'], 'red')).toHaveLength(1);
		expect(checkE2e(0, ['e2e/a.test.ts'], 'green')).toEqual([]);
		expect(checkE2e(1, ['e2e/a.test.ts'], 'green')).toHaveLength(1);
	});
});

describe('formatResult', () => {
	it('違反が無ければ OK、あれば件数と一覧', () => {
		expect(formatResult([])).toBe('TDD 確認: OK\n');
		expect(formatResult(['x', 'y'])).toBe('TDD 確認: NG（2 件）\n- x\n- y\n');
	});
});
