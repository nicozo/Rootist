import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lines = readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8').split('\n');

// .env 系がイメージに入らないことの回帰防止。.dockerignore は後の行が優先されるので順序も検査する
describe('.dockerignore', () => {
	it('サブディレクトリを含む .env 系を除外し、.env.example だけ戻す', () => {
		const envStar = lines.indexOf('**/.env.*');
		expect(lines).toContain('**/.env');
		expect(envStar).toBeGreaterThanOrEqual(0);
		expect(lines.indexOf('!**/.env.example')).toBeGreaterThan(envStar);
	});
});
