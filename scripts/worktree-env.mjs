// issue #152: `pnpm -s worktree-env <サブコマンド>` の入口。判定ロジックは
// src/lib/dev-tools/worktree-env.ts（単体テスト済み）にあり、ここは副作用（ファイル・git・終了コード）だけを持つ。
// 子プロセスは shell を介さず、引数を配列で渡す。値はここでも出力しない（出力は run() の結果だけ）。
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	lstatSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { parseWorktreeList, run } from '../src/lib/dev-tools/worktree-env.ts';

function safeRealpath(path) {
	try {
		return realpathSync(path);
	} catch {
		return null;
	}
}

const deps = {
	cwd: process.cwd(),
	pid: process.pid,
	listWorktrees(cwd) {
		const result = spawnSync('git', ['-C', cwd, 'worktree', 'list', '--porcelain'], {
			encoding: 'utf8'
		});
		if (result.status !== 0 || typeof result.stdout !== 'string') return null;
		const paths = parseWorktreeList(result.stdout).map(safeRealpath);
		// 先頭（メイン）が解決できなければ失敗。ディレクトリが消えた登録（prunable）は読み飛ばし、他の worktree を巻き込まない
		if (paths.length === 0 || paths[0] === null) return null;
		return paths.filter((p) => p !== null);
	},
	realpath: safeRealpath,
	readText(path) {
		try {
			return readFileSync(path, 'utf8');
		} catch {
			return null;
		}
	},
	isSymlink(path) {
		try {
			return lstatSync(path).isSymbolicLink();
		} catch {
			return false;
		}
	},
	copyFile(from, to) {
		copyFileSync(from, to);
	},
	writeAtomic(tempPath, finalPath, text) {
		let mode = 0o600;
		try {
			mode = statSync(finalPath).mode & 0o777;
		} catch {
			// 既存が無ければ 0600
		}
		try {
			writeFileSync(tempPath, text, { mode });
			chmodSync(tempPath, mode);
			renameSync(tempPath, finalPath);
		} catch (error) {
			rmSync(tempPath, { force: true });
			throw error;
		}
	}
};

const result = run(process.argv.slice(2), deps);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.code;
