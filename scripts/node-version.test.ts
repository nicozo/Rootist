import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Node のバージョンの正は .nvmrc。Dockerfile の FROM は ARG を読めないため、一致をここで検証する
describe('Node のバージョン定義', () => {
	const major = read('.nvmrc').trim();

	it('.nvmrc はメジャーバージョンのみを持つ', () => {
		expect(major).toMatch(/^\d+$/);
	});

	it('Dockerfile の node ベースイメージはすべて .nvmrc と一致する', () => {
		const tags = [...read('Dockerfile').matchAll(/^FROM node:(\d+)-slim\b/gm)].map((m) => m[1]);
		expect(tags.length).toBeGreaterThan(0);
		expect(tags.every((t) => t === major)).toBe(true);
	});

	it('CI の setup-node は .nvmrc を参照し、バージョンを直書きしない', () => {
		const ci = read('.github/workflows/ci.yml');
		expect(ci).not.toMatch(/^\s*node-version:/m);
		expect(ci.match(/node-version-file: \.nvmrc/g)?.length).toBe(
			ci.match(/actions\/setup-node@/g)?.length
		);
	});
});
