import { describe, expect, it } from 'vite-plus/test';
import {
	issueFromBranch,
	linkWorkspaceToIssue,
	parseWorkspacePath,
	slugFromBranch
} from './branch.ts';

describe('issueFromBranch', () => {
	it('issue 番号を取り出す', () => {
		expect(issueFromBranch('feat/issue-116-supabase-email-password-auth')).toEqual({
			kind: 'issue',
			n: 116
		});
	});
	it('main や番号なしは不明', () => {
		expect(issueFromBranch('main')).toEqual({ kind: 'unknown' });
		expect(issueFromBranch('chore/claude-local-config')).toEqual({ kind: 'unknown' });
		expect(issueFromBranch(undefined)).toEqual({ kind: 'unknown' });
	});
	it('ベンチ用ブランチはベンチ', () => {
		expect(issueFromBranch('bench/c7-supabase-ari-1')).toEqual({ kind: 'bench' });
	});
});

describe('slugFromBranch / parseWorkspacePath', () => {
	it('スラッグを取り出す', () => {
		expect(slugFromBranch('feat/issue-73-plan-date')).toBe('plan-date');
		expect(slugFromBranch('main')).toBeNull();
	});
	it('worktree 側でもメイン側でも同じワークスペース名になる', () => {
		const a = parseWorkspacePath(
			'/r/.claude/worktrees/x/.dev-loop/20261003-docker-container-naming/qa_report_iter1.md'
		);
		const b = parseWorkspacePath(
			'/r/.dev-loop/20261003-docker-container-naming/self_evaluation.md'
		);
		expect(a?.ws).toBe('20261003-docker-container-naming');
		expect(b?.ws).toBe(a?.ws);
		expect(b?.slug).toBe('docker-container-naming');
		expect(parseWorkspacePath('/r/src/a.ts')).toBeNull();
	});
});

describe('linkWorkspaceToIssue', () => {
	it('T-13: スラッグは完全一致のみ。前方一致は両方向とも不一致', () => {
		expect(linkWorkspaceToIssue('plan-date', 'feat/issue-73-plan-date')).toBe(73);
		expect(linkWorkspaceToIssue('plan', 'feat/issue-73-plan-date')).toBeNull();
		expect(linkWorkspaceToIssue('plan-date', 'feat/issue-73-plan')).toBeNull();
		expect(linkWorkspaceToIssue('docker-mcp-toolkit', 'feat/issue-73-plan-date')).toBeNull();
	});
	it('T-23: issue 番号の無いブランチ（main 等）は紐付けから外す', () => {
		expect(linkWorkspaceToIssue('plan-date', 'main')).toBeNull();
		expect(linkWorkspaceToIssue('plan-date', undefined)).toBeNull();
	});
});
