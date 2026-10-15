// issue #152: 同じディレクトリの一時ファイルへ書いてから rename する（途中で落ちても元のファイルを壊さない）。
// 失敗したら一時ファイルを消して例外を投げる。一時ファイル名は呼び出し側が決める（worktree-env は
// `.env.*.local` に一致する名前を使い、残っても deny で読めないようにしている）。
//
// 制約: SvelteKit の仮想モジュールを import しない。Node の型除去でそのまま実行できる構文だけで書く。
import { chmodSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

export type FsOps = {
	statMode(path: string): number | null;
	write(path: string, text: string, mode: number): void;
	chmod(path: string, mode: number): void;
	rename(from: string, to: string): void;
	remove(path: string): void;
};

export const realFs: FsOps = {
	statMode(path) {
		try {
			return statSync(path).mode & 0o777;
		} catch {
			return null;
		}
	},
	write: (path, text, mode) => writeFileSync(path, text, { mode }),
	chmod: (path, mode) => chmodSync(path, mode),
	rename: (from, to) => renameSync(from, to),
	remove: (path) => rmSync(path, { force: true })
};

export function writeAtomic(
	tempPath: string,
	finalPath: string,
	text: string,
	fs: FsOps = realFs
): void {
	const mode = fs.statMode(finalPath) ?? 0o600; // 既存の権限を引き継ぐ。無ければ 0600
	try {
		fs.write(tempPath, text, mode);
		fs.chmod(tempPath, mode);
		fs.rename(tempPath, finalPath);
	} catch (error) {
		fs.remove(tempPath);
		throw error;
	}
}
