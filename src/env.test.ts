import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { variables } from './env.js';
import { validateEnvVar } from '#lib/server/test-utils/mock-env.js';

// issue #146: .env.example（環境変数名の正）と src/env.ts の宣言の一致を機械的に検査する。

// .env.example にあるが、アプリのコードからは使わない変数（手元の管理作業用。.claude/rules/database.md）。
const EXAMPLE_ONLY = ['SUPABASE_SECRET_KEY'];

/** .env.example の変数名を抜き出す。`# NAME=...` のコメント行は拾わない */
function parseExampleNames(text: string): string[] {
	return text
		.split('\n')
		.map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
		.filter((name): name is string => name !== undefined);
}

function compareNames(example: string[], declared: string[], exampleOnly: string[]) {
	return {
		declaredButNotInExample: declared.filter((n) => !example.includes(n)),
		exampleButNotDeclared: example.filter((n) => !declared.includes(n) && !exampleOnly.includes(n)),
		staleExampleOnly: exampleOnly.filter((n) => !example.includes(n))
	};
}

describe('.env.example と src/env.ts の変数名の一致', () => {
	const exampleText = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

	it('実物が一致している（両方向 + 除外リストの実在）', () => {
		expect(
			compareNames(parseExampleNames(exampleText), Object.keys(variables), EXAMPLE_ONLY)
		).toEqual({ declaredButNotInExample: [], exampleButNotDeclared: [], staleExampleOnly: [] });
	});

	it('コメント行の変数（# NAME=...）は拾わない', () => {
		expect(parseExampleNames('# COMPOSE_PROJECT_NAME=x\nA=1\n  B=2\n')).toEqual(['A']);
	});

	it('陽性対照: .env.example にあって宣言に無い名前を検出する', () => {
		const r = compareNames(['A', 'NEW_ONE'], ['A'], []);
		expect(r.exampleButNotDeclared).toEqual(['NEW_ONE']);
	});

	it('陽性対照: 宣言にあって .env.example に無い名前を検出する', () => {
		const r = compareNames(['A'], ['A', 'DECLARED_ONLY'], []);
		expect(r.declaredButNotInExample).toEqual(['DECLARED_ONLY']);
	});

	it('陽性対照: 除外リストの名前が .env.example から消えたら検出する', () => {
		const r = compareNames(['A'], ['A'], ['GONE']);
		expect(r.staleExampleOnly).toEqual(['GONE']);
	});
});

// 必須 3 変数は schema が throw する（build 時・起動時の検証に当たる）。利用時必須と任意は undefined で通す
describe('src/env.ts の schema', () => {
	const REQUIRED = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const;
	const NOT_REQUIRED = ['GOOGLE_MAPS_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AUTH_ENABLED'] as const;

	it.each(REQUIRED.flatMap((n) => [undefined, ''].map((v) => [n, v] as const)))(
		'必須の %s は %j のとき変数名入りのエラーで throw する',
		(name, value) => {
			expect(() => validateEnvVar(name, value)).toThrow(`${name} is not set`);
		}
	);

	it.each(REQUIRED)('必須の %s は値があればそのまま返す（値はエラーに含めない）', (name) => {
		expect(validateEnvVar(name, 'v-123')).toBe('v-123');
	});

	it.each(NOT_REQUIRED)('%s は未定義・空文字でも throw せず undefined を返す', (name) => {
		expect(validateEnvVar(name, undefined)).toBeUndefined();
		expect(validateEnvVar(name, '')).toBeUndefined();
		expect(validateEnvVar(name, 'x')).toBe('x');
	});
});
