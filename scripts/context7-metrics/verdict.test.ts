import { describe, expect, it } from 'vite-plus/test';
import { parseVerdict } from './verdict.ts';

describe('parseVerdict', () => {
	it('T-7: 太字・括弧書き付きの総合判定を読む', () => {
		expect(parseVerdict('## 総合判定: **FAIL**（MEDIUM 1 件。理由）')).toBe('FAIL');
		expect(parseVerdict('## 総合判定: **PASS**')).toBe('PASS');
		expect(parseVerdict('総合判定： PASS')).toBe('PASS');
	});
	it('T-17: 書式見本 `PASS / FAIL` は判定不能', () => {
		expect(parseVerdict('## 総合判定: PASS / FAIL')).toBe('判定不能');
	});
	it('判定行が無ければ判定不能', () => {
		expect(parseVerdict('# レポート\n本文')).toBe('判定不能');
	});
});
