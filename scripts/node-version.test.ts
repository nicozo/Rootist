import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Node のバージョンの正は .nvmrc。Dockerfile の ARG は読み込めないため、一致をここで検証する
describe('Node のバージョン定義', () => {
	const major = read('.nvmrc').trim();

	it('.nvmrc はメジャーバージョンのみを持つ', () => {
		expect(major).toMatch(/^\d+$/);
	});

	it('Dockerfile の ARG NODE_VERSION の既定値は .nvmrc と一致する', () => {
		expect(read('Dockerfile')).toMatch(new RegExp(`^ARG NODE_VERSION=${major}$`, 'm'));
	});

	it('Dockerfile の node ベースイメージはすべて ARG NODE_VERSION を参照する', () => {
		const froms = read('Dockerfile')
			.split('\n')
			.filter((l) => /^FROM\b.*\bnode:/.test(l));
		expect(froms.length).toBeGreaterThan(0);
		expect(froms.every((l) => /\bnode:\$\{NODE_VERSION\}-slim\b/.test(l))).toBe(true);
	});

	it('CI の setup-node は .nvmrc を参照し、バージョンを直書きしない', () => {
		const ci = read('.github/workflows/ci.yml');
		expect(ci).not.toMatch(/^\s*node-version:/m);
		expect(ci.match(/node-version-file: \.nvmrc/g)?.length).toBe(
			ci.match(/actions\/setup-node@/g)?.length
		);
	});
});
