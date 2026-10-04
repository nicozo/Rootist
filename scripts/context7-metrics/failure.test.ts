import { describe, expect, it } from 'vite-plus/test';
import { classifyFailure } from './failure.ts';

describe('classifyFailure', () => {
	it('T-8: is_error が無くても文言で障害を検出する', () => {
		expect(classifyFailure({ isError: false, head: 'Invalid API key. Please check' })).toBe(
			'キー失効・認証エラー'
		);
		expect(classifyFailure({ isError: false, head: 'Rate limit exceeded' })).toBe('レート制限');
		expect(classifyFailure({ isError: false, head: 'fetch failed' })).toBe('接続失敗');
	});
	it('is_error のみで既知文言なしは「その他」', () => {
		expect(classifyFailure({ isError: true, head: 'something' })).toBe('その他');
	});
	it('成功した本文の後ろの方にある語は拾わない', () => {
		const head = `${'x'.repeat(400)} rate limit Invalid API key`;
		expect(classifyFailure({ isError: false, head })).toBeNull();
	});
});
