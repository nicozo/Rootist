import { describe, expect, it } from 'vite-plus/test';
import { writeAtomic, type FsOps } from './atomic-write';

// issue #152: 書き込みが途中で失敗したときに一時ファイルを残さないこと（残ると deny の対象外名なら実値が読める）。

function fakeFs(over: Partial<FsOps> = {}) {
	const files = new Map<string, string>([['/d/.env', 'OLD=1\n']]);
	const fs: FsOps = {
		statMode: (path) => (files.has(path) ? 0o640 : null),
		write: (path, text) => void files.set(path, text),
		chmod: () => undefined,
		rename: (from, to) => {
			files.set(to, files.get(from) ?? '');
			files.delete(from);
		},
		remove: (path) => void files.delete(path),
		...over
	};
	return { files, fs };
}

describe('writeAtomic', () => {
	it('一時ファイルに書いてから置き換え、一時ファイルを残さない', () => {
		const { files, fs } = fakeFs();
		writeAtomic('/d/.env.worktree-env-1.local', '/d/.env', 'NEW=2\n', fs);
		expect([...files.keys()]).toEqual(['/d/.env']);
		expect(files.get('/d/.env')).toBe('NEW=2\n');
	});

	it('rename に失敗したら一時ファイルを消し、元のファイルは変わらない', () => {
		const { files, fs } = fakeFs({
			rename: () => {
				throw new Error('boom');
			}
		});
		expect(() => writeAtomic('/d/.env.worktree-env-1.local', '/d/.env', 'NEW=2\n', fs)).toThrow();
		expect([...files.keys()]).toEqual(['/d/.env']);
		expect(files.get('/d/.env')).toBe('OLD=1\n');
	});

	it('書き込み自体に失敗しても一時ファイルを残さない', () => {
		const { files, fs } = fakeFs({
			write: (path) => {
				files.set(path, 'partial');
				throw new Error('disk full');
			}
		});
		expect(() => writeAtomic('/d/.env.worktree-env-1.local', '/d/.env', 'NEW=2\n', fs)).toThrow();
		expect([...files.keys()]).toEqual(['/d/.env']);
	});
});
