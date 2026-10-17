import { describe, expect, it } from 'vite-plus/test';
import { isJsonValue } from '#lib/json-value.js';

describe('isJsonValue', () => {
	it.each([
		['文字列', 'a'],
		['有限の数値', 1.5],
		['真偽値', false],
		['null', null],
		['undefined（キー無しと同じ）', undefined],
		['入れ子のオブジェクトと配列', { a: [1, { b: 'c' }], d: null }],
		['プロトタイプなしのオブジェクト', Object.assign(Object.create(null), { a: 1 })]
	])('受理する: %s', (_label, value) => {
		expect(isJsonValue(value)).toBe(true);
	});

	it.each([
		['NaN', Number.NaN],
		['Infinity', Infinity],
		['BigInt', 1n],
		['Date', new Date()],
		['Map', new Map()],
		['Set', new Set()],
		['File', new File(['x'], 'a.txt')],
		['関数', () => 1],
		['Symbol', Symbol('s')],
		['クラスのインスタンス', new (class Foo {})()],
		['入れ子の中の Date', { a: [{ b: new Date() }] }]
	])('拒否する: %s', (_label, value) => {
		expect(isJsonValue(value)).toBe(false);
	});

	it('循環参照は無限再帰せず拒否する', () => {
		const loop: Record<string, unknown> = {};
		loop.self = loop;

		expect(isJsonValue(loop)).toBe(false);
	});
});
