import { describe, expect, it, afterEach } from 'vitest';
import { isPlanDate, formatPlanDate } from './plan-date';

// issue #73: planDate（プラン全体の日付）の形式検証・実在日判定・表示整形の単体テスト。

describe('isPlanDate', () => {
	it.each(['2026-09-05', '2026-01-01', '2024-02-29', '1999-12-31', '2099-12-31'])(
		'%s は true',
		(value) => {
			expect(isPlanDate(value)).toBe(true);
		}
	);

	it.each([
		'2026-9-5',
		'2026-02-30',
		'2026-13-01',
		'2026-04-31',
		'2026/09/05',
		'2026-09-05T00:00:00Z',
		'',
		'abc',
		20260905,
		null,
		undefined,
		{}
	])('%s は false', (value) => {
		expect(isPlanDate(value)).toBe(false);
	});
});

describe('formatPlanDate', () => {
	it.each([
		['2026-09-05', '2026年9月5日（土）'],
		['2026-01-01', '2026年1月1日（木）'],
		['2026-12-31', '2026年12月31日（木）'],
		['2024-02-29', '2024年2月29日（木）']
	])('%s → %s', (input, expected) => {
		expect(formatPlanDate(input)).toBe(expected);
	});

	it('月日がゼロ埋めされない', () => {
		expect(formatPlanDate('2026-01-01')).not.toContain('01月');
		expect(formatPlanDate('2026-01-01')).not.toContain('01日');
	});

	it('isPlanDateを満たさない形式外の入力は空文字を返す（防御的フォールバック）', () => {
		expect(formatPlanDate('2026/09/05')).toBe('');
	});

	describe('タイムゾーン非依存', () => {
		const ORIGINAL_TZ = process.env.TZ;

		afterEach(() => {
			process.env.TZ = ORIGINAL_TZ;
		});

		it.each(['UTC', 'Asia/Tokyo', 'Pacific/Midway', 'Pacific/Kiritimati'])(
			'TZ=%s でも 2026年9月5日（土） になる',
			(tz) => {
				process.env.TZ = tz;
				expect(formatPlanDate('2026-09-05')).toBe('2026年9月5日（土）');
			}
		);
	});
});
