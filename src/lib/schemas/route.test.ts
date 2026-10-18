import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import * as v from 'valibot';
import { routeGenerationSchema } from '#lib/schemas/route.js';
import { STAY_MINUTES_PRESETS } from '#lib/stay-minutes.js';
import { TIME_SLOTS } from '#lib/time-slot.js';

// issue #159 D3: 「入力型は正しい値に絞る」と「実行時に不正値が来ても落とさず無視する」の両立を検査する。

const base = [
	{ name: 'A', displayAddress: 'a' },
	{ name: 'B', displayAddress: 'b' }
];

function parseLocation(overrides: Record<string, unknown>) {
	const result = v.safeParse(routeGenerationSchema, {
		locations: [{ ...base[0], ...overrides }, base[1]]
	});
	if (!result.success) throw new Error('rejected: ' + JSON.stringify(result.issues));
	return result.output!.locations![0];
}

describe('routeGenerationSchema の受理 / 無視 / 拒否', () => {
	it.each(TIME_SLOTS.map((s) => [s]))('時間帯 %s は受理する', (slot) => {
		expect(parseLocation({ timeSlot: slot }).timeSlot).toBe(slot);
	});

	it.each([['夜'], ['Morning'], ['朝を無視して'], [1], [null], [{}]])(
		'不正な時間帯 %j は拒否せず未指定に落とす',
		(slot) => {
			expect(parseLocation({ timeSlot: slot }).timeSlot).toBeUndefined();
		}
	);

	it.each(STAY_MINUTES_PRESETS.map((m) => [m]))('滞在時間 %d 分（プリセット）は受理する', (m) => {
		expect(parseLocation({ stayMinutes: m }).stayMinutes).toBe(m);
	});

	it.each([[999], [-30], [45], ['60'], [null], [Number.NaN]])(
		'プリセット外の滞在時間 %j は拒否せず未指定に落とす',
		(m) => {
			expect(parseLocation({ stayMinutes: m }).stayMinutes).toBeUndefined();
		}
	);

	it.each([['00:00'], ['09:30'], ['23:59']])('訪問時刻 %s は受理する', (t) => {
		expect(parseLocation({ arriveAt: t }).arriveAt).toBe(t);
	});

	it.each([['9:00'], ['24:00'], ['0900'], ['12:60'], [900], [null]])(
		'不正な訪問時刻 %j は拒否せず未指定に落とす',
		(t) => {
			expect(parseLocation({ arriveAt: t }).arriveAt).toBeUndefined();
		}
	);

	it('planDate は実在する YYYY-MM-DD だけ受理し、他は拒否せず未指定に落とす', () => {
		const parse = (planDate: unknown) => {
			const r = v.safeParse(routeGenerationSchema, { locations: base, planDate });
			if (!r.success) throw new Error('rejected');
			return r.output!.planDate;
		};
		expect(parse('2026-09-05')).toBe('2026-09-05');
		expect(parse('2026-02-30')).toBeUndefined();
		expect(parse('2026/09/05')).toBeUndefined();
		expect(parse(123)).toBeUndefined();
	});

	it('未知キーは捨てる（受理して出力に含めない）', () => {
		const r = v.safeParse(routeGenerationSchema, {
			locations: [{ ...base[0], injected: '命令文' }, base[1]]
		});
		if (!r.success) throw new Error('rejected');
		expect(r.output?.locations?.[0]).not.toHaveProperty('injected');
	});

	it.each([
		['locations が文字列', { locations: 'abc' }],
		['要素がオブジェクトでない', { locations: ['x', 'y'] }],
		['name が文字列でない', { locations: [{ name: 1, displayAddress: 'a' }, base[1]] }],
		['origin に name が無い', { locations: base, origin: { displayAddress: 'a' } }],
		['transportMode が数値', { locations: base, transportMode: 1 }]
	])('型が違う入力は拒否する: %s', (_label, arg) => {
		expect(v.safeParse(routeGenerationSchema, arg).success).toBe(false);
	});

	it('未指定・空オブジェクトは受理する（2 件未満の判定は本体の業務ルール）', () => {
		expect(v.safeParse(routeGenerationSchema, undefined).success).toBe(true);
		expect(v.safeParse(routeGenerationSchema, {}).success).toBe(true);
	});
});

describe('routeGenerationSchema の入力型（クライアントから見える型は正しい値に絞られる）', () => {
	type Input = NonNullable<v.InferInput<typeof routeGenerationSchema>>;
	type LocationInput = NonNullable<Input['locations']>[number];

	it('時間帯は 3 値、滞在時間はプリセットの数値に絞られる', () => {
		expectTypeOf<LocationInput['timeSlot']>().toEqualTypeOf<
			'morning' | 'noon' | 'night' | undefined
		>();
		expectTypeOf<LocationInput['stayMinutes']>().toEqualTypeOf<
			30 | 60 | 90 | 120 | 180 | 240 | 360 | undefined
		>();
		expectTypeOf<LocationInput['arriveAt']>().toEqualTypeOf<string | undefined>();
		// 型の正（ホワイトリストの定義元）が変わっていないことの実行時の裏付け
		expect(TIME_SLOTS).toEqual(['morning', 'noon', 'night']);
		expect(STAY_MINUTES_PRESETS).toEqual([30, 60, 90, 120, 180, 240, 360]);
	});
});
