import type { IssueKey, WorkspacePath } from './types.ts';

/** C のベンチ実行用ブランチの接頭辞（docs/context7-benchmark/README.md と一致させる）。 */
export const BENCH_PREFIX = 'bench/c7-';

/** `feat/issue-116-foo` → issue 116。`bench/c7-...` → ベンチ。それ以外 → 不明。 */
export function issueFromBranch(branch: string | undefined): IssueKey {
	if (!branch) return { kind: 'unknown' };
	if (branch.startsWith(BENCH_PREFIX)) return { kind: 'bench' };
	const m = /(?:^|\/)issue-(\d+)(?:-|$)/.exec(branch);
	if (!m) return { kind: 'unknown' };
	return { kind: 'issue', n: Number(m[1]) };
}

/** `feat/issue-116-foo-bar` → `foo-bar`。issue 番号が無ければ null。 */
export function slugFromBranch(branch: string | undefined): string | null {
	if (!branch) return null;
	const m = /(?:^|\/)issue-\d+-(.+)$/.exec(branch);
	return m ? m[1] : null;
}

/**
 * パスが `.dev-loop/<YYYYMMDD>-<slug>/<file>` を含むとき分解する。
 * worktree 側（.claude/worktrees/<名前>/.dev-loop/...）でもメイン側でも同じ結果になる。
 */
export function parseWorkspacePath(path: string): WorkspacePath | null {
	const m = /\.dev-loop\/(\d{8}-([^/]+))\/(.+)$/.exec(path);
	if (!m) return null;
	return { ws: m[1], slug: m[2], file: m[3] };
}

/**
 * ワークスペースの slug とブランチを照合し、紐付く issue 番号を返す。
 * 完全一致のみ（前方一致・部分一致は採用しない）。ブランチに `issue-<N>` が無い行（main 等）は不一致。
 */
export function linkWorkspaceToIssue(slug: string, branch: string | undefined): number | null {
	const issue = issueFromBranch(branch);
	if (issue.kind !== 'issue') return null;
	return slugFromBranch(branch) === slug ? issue.n : null;
}
