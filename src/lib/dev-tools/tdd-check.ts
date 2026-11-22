// issue #181: dev-loop の TDD 確認（`pnpm -s tdd-check`）の判定ロジック。
// 入口（scripts/tdd-check.mjs）は git とコンテナでのテスト実行の副作用だけを持ち、判定はすべてここで行う。
//
// 確かめること:
// 1. テストだけのコミットが実装より先にある（ベース〜テストのコミットの手前で、テストと spec 以外が変わっていない）
// 2. テストのコミットがテストのファイルだけを追加・変更している。実装より前なら、テストだけのコミットが複数あってよい
//    （テストの直しは履歴を書き換えずに追加のコミットで行う。issue #190）。そのときは最後のテストだけのコミットを渡し、
//    ベース〜そのコミットの差分（spec を除く）をまとめて「テストのコミット」の中身として扱う
// 3. テストのコミットより後で、そのテストが緩められていない（行の削除・ファイルの削除・skip 等の追加が無い）
// 4. テストのコミットの時点では追加・変更したテストが失敗し（RED）、最新の時点では通る（GREEN）

/** テストのファイル（テスト本体と、テストだけが使う共通処理）。分類の正は .claude/rules/testing.md */
export function isTestFile(path: string): boolean {
	return (
		/\.(test|spec)\.(ts|js)$/.test(path) ||
		path.startsWith('e2e/') ||
		/(^|\/)test-utils\//.test(path) ||
		/(^|\/)fixtures\//.test(path)
	);
}

/** E2E（Playwright）のテストか。それ以外のテストは Vitest で実行する */
export function isE2eTest(path: string): boolean {
	return path.startsWith('e2e/') && /\.(test|spec)\.(ts|js)$/.test(path);
}

/** Vitest で実行するテスト本体か（共通処理・fixture は除く） */
export function isUnitTest(path: string): boolean {
	return !path.startsWith('e2e/') && /\.(test|spec)\.(ts|js)$/.test(path);
}

/** テストより先に変わってよいファイル（spec・計画など、実装ではないもの） */
export function isAllowedBeforeTests(path: string): boolean {
	return isTestFile(path) || path.startsWith('specs/');
}

export type FileChange = { status: string; path: string };

/** `git diff --name-status` の出力を読む。リネーム・コピー（R/C）は新しい側のパスを使い、状態は先頭 1 文字にする */
export function parseNameStatus(text: string): FileChange[] {
	return text
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => {
			const parts = line.split('\t');
			return { status: parts[0].charAt(0), path: parts[parts.length - 1] };
		});
}

/** テストのコミットより前（ベース〜テストのコミットの親）に、実装の変更が無いか */
export function checkOrder(changedBeforeTests: string[]): string[] {
	return changedBeforeTests
		.filter((path) => !isAllowedBeforeTests(path))
		.map((path) => `テストのコミットより前に実装が変わっている: ${path}`);
}

/** ベース〜テストのコミットの差分から spec を除き、「テストのコミット」の中身として扱う変更を返す */
export function testRangeChanges(changes: FileChange[]): FileChange[] {
	return changes.filter((change) => !change.path.startsWith('specs/'));
}

/** テストのコミットの中身。テストのファイルの追加・変更だけで、1 件以上あること */
export function checkTestCommit(changes: FileChange[]): string[] {
	if (changes.length === 0) return ['テストのコミットに変更が無い'];
	const violations: string[] = [];
	for (const change of changes) {
		if (!isTestFile(change.path)) {
			violations.push(`テストのコミットにテスト以外の変更がある: ${change.path}`);
		} else if (change.status === 'D') {
			violations.push(`テストのコミットでテストを削除している: ${change.path}`);
		}
	}
	if (
		!changes.some(
			(change) => change.status !== 'D' && (isUnitTest(change.path) || isE2eTest(change.path))
		)
	) {
		violations.push('テストのコミットに実行できるテスト（*.test.ts / e2e/）が無い');
	}
	return violations;
}

/** テストを無効化・弱める書き方（追加された行で見つかったら緩めたとみなす） */
const WEAKENING =
	/\.(skip|todo|fails)\b|\b(xit|xdescribe|xtest)\s*\(|\bit\.only\b|\btest\.only\b|\bdescribe\.only\b/;

/**
 * `git diff <テストのコミット> HEAD -- <テストのファイル>` の unified diff から、緩めた跡を探す。
 * テストのコミットの後は、テストに足すこと（新しいケース・補助の追加）だけを許す。
 * 行の削除・書き換え（削除行が出る）・ファイルの削除・skip 等の追加はすべて違反にする。
 */
export function checkNotWeakened(diff: string): string[] {
	const violations: string[] = [];
	let file = '';
	for (const line of diff.split('\n')) {
		if (line.startsWith('diff --git ')) {
			file = line.replace(/^diff --git a\/(.+) b\/.+$/, '$1');
		} else if (line.startsWith('deleted file mode')) {
			violations.push(`テストのコミットの後でテストを削除している: ${file}`);
		} else if (line.startsWith('-') && !line.startsWith('---')) {
			violations.push(
				`テストのコミットの後でテストの行を消している・書き換えている: ${file}: ${line.slice(1).trim()}`
			);
		} else if (line.startsWith('+') && !line.startsWith('+++') && WEAKENING.test(line)) {
			violations.push(
				`テストのコミットの後でテストを無効化している: ${file}: ${line.slice(1).trim()}`
			);
		}
	}
	return violations;
}

/** Vitest の JSON レポート（`--reporter=json`）のうち、判定に使う部分 */
export type VitestReport = {
	testResults?: { name: string; status: string; message?: string }[];
};

/** レポートのファイル名（コンテナ内の絶対パス）をリポジトリ相対に直す */
function relative(name: string, root: string): string {
	const prefix = root.endsWith('/') ? root : `${root}/`;
	return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** テストのコミットの時点（RED）: 指定したテストのファイルがすべて失敗していること */
export function checkRed(report: VitestReport, files: string[], root: string): string[] {
	const results = new Map(
		(report.testResults ?? []).map((r) => [relative(r.name, root), r.status])
	);
	const violations: string[] = [];
	for (const file of files) {
		const status = results.get(file);
		if (status === undefined) violations.push(`テストのコミットの時点で実行されなかった: ${file}`);
		else if (status !== 'failed')
			violations.push(
				`テストのコミットの時点で失敗していない（実装より先に書かれたテストになっていない）: ${file}`
			);
	}
	return violations;
}

/** 最新の時点（GREEN）: 指定したテストのファイルがすべて通ること */
export function checkGreen(report: VitestReport, files: string[], root: string): string[] {
	const results = new Map(
		(report.testResults ?? []).map((r) => [relative(r.name, root), r.status])
	);
	const violations: string[] = [];
	for (const file of files) {
		const status = results.get(file);
		if (status === undefined) violations.push(`最新の時点で実行されなかった: ${file}`);
		else if (status !== 'passed') violations.push(`最新の時点で通っていない: ${file}`);
	}
	return violations;
}

/** E2E は Playwright の終了コードで判定する（ファイル単位の判定はしない） */
export function checkE2e(exitCode: number, files: string[], phase: 'red' | 'green'): string[] {
	if (files.length === 0) return [];
	if (phase === 'red' && exitCode === 0)
		return [`テストのコミットの時点で E2E が失敗していない: ${files.join(', ')}`];
	if (phase === 'green' && exitCode !== 0)
		return [`最新の時点で E2E が通っていない: ${files.join(', ')}`];
	return [];
}

/** 結果の表示。違反が無ければ OK、あれば一覧（dev-loop は終了コード 1 で Generator に差し戻す） */
export function formatResult(violations: string[]): string {
	if (violations.length === 0) return 'TDD 確認: OK\n';
	return `TDD 確認: NG（${violations.length} 件）\n${violations.map((v) => `- ${v}`).join('\n')}\n`;
}
