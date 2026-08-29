import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// issue #62: プラン保存APIの単体テスト。DBへは実接続せずinsertをモックする。

const { insertValues, dbMock } = vi.hoisted(() => {
	const insertValues = vi.fn();
	return {
		insertValues,
		dbMock: { insert: vi.fn(() => ({ values: insertValues })) }
	};
});

vi.mock('$lib/server/db', () => ({ db: dbMock }));
vi.mock('$lib/server/db/schema', () => ({ plans: {} }));

const { POST } = await import('./+server');

/** RequestHandlerに渡す最小限のイベント。テスト対象はrequestしか参照しない。 */
function eventWith(rawBody: string) {
	return {
		request: new Request('http://localhost/api/plans', { method: 'POST', body: rawBody })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

function jsonEvent(body: unknown) {
	return eventWith(JSON.stringify(body));
}

/** バリデーションを通過する最小の目的地。 */
function destination(order: number, overrides: Record<string, unknown> = {}) {
	return {
		order,
		name: `場所${order}`,
		displayAddress: `住所${order}`,
		arrivalTime: '09:00',
		departureTime: '10:00',
		...overrides
	};
}

beforeEach(() => {
	insertValues.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('POST /api/plans バリデーション', () => {
	it('100KBを超えるボディを拒否する', async () => {
		const huge = 'a'.repeat(100 * 1024 + 1);

		await expect(POST(eventWith(huge))).rejects.toMatchObject({
			status: 400,
			body: { message: 'リクエストボディが大きすぎます' }
		});
		expect(insertValues).not.toHaveBeenCalled();
	});

	it('不正なJSONを拒否する', async () => {
		await expect(POST(eventWith('{ not json'))).rejects.toMatchObject({
			status: 400,
			body: { message: '不正なJSON形式です' }
		});
	});

	it('nullボディを拒否する', async () => {
		await expect(POST(jsonEvent(null))).rejects.toMatchObject({
			status: 400,
			body: { message: '不正なリクエストです' }
		});
	});

	it('オブジェクト以外のボディを拒否する', async () => {
		await expect(POST(jsonEvent('文字列'))).rejects.toMatchObject({
			status: 400,
			body: { message: '不正なリクエストです' }
		});
	});

	it('destinationsが配列でない場合を拒否する', async () => {
		await expect(POST(jsonEvent({ destinations: 'not-array' }))).rejects.toMatchObject({
			status: 400,
			body: { message: 'destinations は1件以上必要です' }
		});
	});

	it('destinationsが空配列の場合を拒否する', async () => {
		await expect(POST(jsonEvent({ destinations: [] }))).rejects.toMatchObject({
			status: 400,
			body: { message: 'destinations は1件以上必要です' }
		});
	});

	it.each([
		['null要素', null],
		['オブジェクト以外の要素', 'string'],
		['orderが数値でない', destination(1, { order: '1' })],
		['orderがNaN', destination(1, { order: Number.NaN })],
		['orderが0以下', destination(1, { order: 0 })],
		['nameが空文字', destination(1, { name: '' })],
		['nameが文字列でない', destination(1, { name: 123 })],
		['displayAddressが空文字', destination(1, { displayAddress: '' })],
		['arrivalTimeが空文字', destination(1, { arrivalTime: '' })],
		['departureTimeが空文字', destination(1, { departureTime: '' })]
	])('destinationsの形式が不正な場合を拒否する: %s', async (_label, bad) => {
		await expect(POST(jsonEvent({ destinations: [bad] }))).rejects.toMatchObject({
			status: 400,
			body: { message: 'destinations の形式が不正です' }
		});
	});

	it('orderが重複している場合を拒否する', async () => {
		await expect(
			POST(jsonEvent({ destinations: [destination(1), destination(1)] }))
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'destinations の order が重複しています' }
		});
	});
});

describe('POST /api/plans 保存', () => {
	it('shareIdを発行して201を返す', async () => {
		const res = await POST(jsonEvent({ destinations: [destination(1)], summary: '概要' }));

		expect(res.status).toBe(201);
		const { shareId } = await res.json();
		expect(shareId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({ shareId, data: expect.objectContaining({ summary: '概要' }) })
		);
	});

	it('呼び出しごとに異なるshareIdを発行する', async () => {
		const first = await (await POST(jsonEvent({ destinations: [destination(1)] }))).json();
		const second = await (await POST(jsonEvent({ destinations: [destination(1)] }))).json();

		expect(first.shareId).not.toBe(second.shareId);
	});

	it('既知フィールドのみ保存し、未知の巨大キーは捨てる', async () => {
		await POST(
			jsonEvent({
				destinations: [
					destination(1, {
						description: '説明',
						travelTimeFromPrevious: '徒歩10分',
						transitRoute: null,
						timeSlot: 'morning',
						stayMinutes: 90,
						injected: 'x'.repeat(1000)
					})
				]
			})
		);

		const saved = insertValues.mock.calls[0][0].data;
		expect(saved.destinations[0]).toEqual({
			order: 1,
			name: '場所1',
			displayAddress: '住所1',
			arrivalTime: '09:00',
			departureTime: '10:00',
			description: '説明',
			travelTimeFromPrevious: '徒歩10分',
			transitRoute: null,
			timeSlot: 'morning',
			stayMinutes: 90
		});
		expect(saved.destinations[0]).not.toHaveProperty('injected');
	});

	it('summaryが文字列でない場合は空文字にする', async () => {
		await POST(jsonEvent({ destinations: [destination(1)], summary: 123 }));

		expect(insertValues.mock.calls[0][0].data.summary).toBe('');
	});

	it('origin/endDestinationを正規化して保存する', async () => {
		await POST(
			jsonEvent({
				destinations: [destination(1)],
				origin: { name: '東京駅', displayAddress: '千代田区', extra: 'drop' },
				endDestination: { name: 'ホテル', displayAddress: '新宿区' },
				transportMode: 'transit',
				startTime: '09:00'
			})
		);

		const saved = insertValues.mock.calls[0][0].data;
		expect(saved.origin).toEqual({ name: '東京駅', displayAddress: '千代田区' });
		expect(saved.endDestination).toEqual({ name: 'ホテル', displayAddress: '新宿区' });
		expect(saved.transportMode).toBe('transit');
		expect(saved.startTime).toBe('09:00');
	});

	it.each([
		['未指定', undefined],
		['null', null],
		['オブジェクト以外', 'string'],
		['nameが欠落', { displayAddress: '千代田区' }],
		['displayAddressが欠落', { name: '東京駅' }]
	])('不正なoriginはundefined・endDestinationはnullに落とす: %s', async (_label, place) => {
		await POST(jsonEvent({ destinations: [destination(1)], origin: place, endDestination: place }));

		const saved = insertValues.mock.calls[0][0].data;
		expect(saved.origin).toBeUndefined();
		expect(saved.endDestination).toBeNull();
	});

	it('transportMode/startTimeが文字列でない場合はnullにする', async () => {
		await POST(
			jsonEvent({ destinations: [destination(1)], transportMode: 1, startTime: { at: 9 } })
		);

		const saved = insertValues.mock.calls[0][0].data;
		expect(saved.transportMode).toBeNull();
		expect(saved.startTime).toBeNull();
	});

	it('DB insertが失敗したら500を投げ、DBの生エラーは返さない', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		insertValues.mockRejectedValue(new Error('ER_DUP_ENTRY: secret table detail'));

		await expect(POST(jsonEvent({ destinations: [destination(1)] }))).rejects.toMatchObject({
			status: 500,
			body: { message: 'プランの保存に失敗しました' }
		});
	});
});
