import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #62 / #149: プラン生成APIの単体テスト。
// 訪問順序とスケジュールはサーバー内で計算し、外部API（課金対象）を一切呼ばないことも確認する。

const { POST } = await import('./+server');

/** RequestHandlerに渡す最小限のイベント。テスト対象はrequestしか参照しない。 */
function eventWith(body: unknown) {
	return {
		request: new Request('http://localhost/api/route', {
			method: 'POST',
			body: JSON.stringify(body)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

const SENSOJI = {
	name: '浅草寺',
	displayAddress: '台東区',
	location: { lat: 35.7148, lng: 139.7967 }
};
const SKYTREE = {
	name: '東京スカイツリー',
	displayAddress: '墨田区',
	location: { lat: 35.7101, lng: 139.8107 }
};
const TOKYO_TOWER = {
	name: '東京タワー',
	displayAddress: '港区',
	location: { lat: 35.6586, lng: 139.7454 }
};
const TOKYO_STATION = {
	name: '東京駅',
	displayAddress: '千代田区',
	location: { lat: 35.6812, lng: 139.7671 }
};
const TWO_LOCATIONS = [SENSOJI, SKYTREE];

async function postJson(body: unknown) {
	const res = await POST(eventWith(body));
	return res.json();
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchSpy = vi.fn();
	vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
	// 外部API（Gemini・Places等）を一度も呼ばないこと
	expect(fetchSpy).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('POST /api/route 入力検証', () => {
	it('locationsが未指定なら400を返す', async () => {
		await expect(POST(eventWith({}))).rejects.toMatchObject({
			status: 400,
			body: { message: '2件以上の目的地が必要です' }
		});
	});

	it('locationsが1件なら400を返す', async () => {
		await expect(POST(eventWith({ locations: [SENSOJI] }))).rejects.toMatchObject({
			status: 400,
			body: { message: '2件以上の目的地が必要です' }
		});
	});

	it.each([
		['座標が無い', { name: '浅草寺', displayAddress: '台東区' }],
		['緯度が範囲外', { ...SENSOJI, location: { lat: 135, lng: 139 } }],
		['座標が文字列', { ...SENSOJI, location: { lat: '35', lng: '139' } }]
	])('目的地の%s場合は400を返す', async (_label, invalid) => {
		await expect(POST(eventWith({ locations: [invalid, SKYTREE] }))).rejects.toMatchObject({
			status: 400,
			body: { message: '位置情報が取得できていない場所があります' }
		});
	});

	it('出発地・終点に座標が無い場合も400を返す', async () => {
		const noLocation = { name: '東京駅', displayAddress: '千代田区' };
		await expect(
			POST(eventWith({ locations: TWO_LOCATIONS, origin: noLocation }))
		).rejects.toMatchObject({ status: 400 });
		await expect(
			POST(eventWith({ locations: TWO_LOCATIONS, endDestination: noLocation }))
		).rejects.toMatchObject({ status: 400 });
	});
});

describe('POST /api/route 訪問順序', () => {
	it('出発地から近い順に、往復しない順序で並べる', async () => {
		// 東京タワー発。東京駅を経由して北東の浅草寺・スカイツリーへ向かうのが最短（東京駅を最後にすると往復になる）
		const data = await postJson({
			locations: [SKYTREE, TOKYO_STATION, SENSOJI],
			origin: TOKYO_TOWER,
			transportMode: 'car'
		});
		const names = data.destinations.map((d: { name: string }) => d.name);
		expect(names[0]).toBe('東京駅');
		expect(names.slice(1).sort()).toEqual(['東京スカイツリー', '浅草寺'].sort());
	});

	it('orderは1始まりの連番で、全ての目的地を1回ずつ含む', async () => {
		const data = await postJson({ locations: [SKYTREE, TOKYO_TOWER, SENSOJI, TOKYO_STATION] });
		expect(data.destinations.map((d: { order: number }) => d.order)).toEqual([1, 2, 3, 4]);
		expect(data.destinations.map((d: { name: string }) => d.name).sort()).toEqual(
			[SKYTREE, TOKYO_TOWER, SENSOJI, TOKYO_STATION].map((l) => l.name).sort()
		);
	});
});

describe('POST /api/route スケジュール', () => {
	it('開始時間が未指定なら09:00に開始する（出発地なしなら1件目に09:00着）', async () => {
		const data = await postJson({ locations: TWO_LOCATIONS });
		expect(data.destinations[0].arrivalTime).toBe('09:00');
		expect(data.destinations[0].travelTimeFromPrevious).toBeNull();
		expect(data.startTime).toBeNull();
	});

	it('開始時間を指定するとその時刻に出発する', async () => {
		const data = await postJson({ locations: TWO_LOCATIONS, startTime: '10:30' });
		expect(data.destinations[0].arrivalTime).toBe('10:30');
		expect(data.startTime).toBe('10:30');
	});

	it('形式外の開始時間は無視して09:00で計算する', async () => {
		const data = await postJson({ locations: TWO_LOCATIONS, startTime: '9時' });
		expect(data.destinations[0].arrivalTime).toBe('09:00');
		expect(data.startTime).toBeNull();
	});

	it('出発地を指定すると1件目にも出発地からの移動時間が付く', async () => {
		const data = await postJson({
			locations: TWO_LOCATIONS,
			origin: TOKYO_STATION,
			transportMode: 'car'
		});
		expect(data.destinations[0].travelTimeFromPrevious).toMatch(/^車で約\d+分$/);
		expect(data.destinations[0].arrivalTime).not.toBe('09:00');
	});

	it('滞在時間の指定どおりに到着〜出発を空ける', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, stayMinutes: 90 }, SKYTREE],
			startTime: '09:00'
		});
		const sensoji = data.destinations.find((d: { name: string }) => d.name === '浅草寺');
		const [h1, m1] = sensoji.arrivalTime.split(':').map(Number);
		const [h2, m2] = sensoji.departureTime.split(':').map(Number);
		expect(h2 * 60 + m2 - (h1 * 60 + m1)).toBe(90);
		expect(sensoji.stayMinutes).toBe(90);
	});

	it('訪問時刻の指定がある目的地はその時刻に到着する', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, arriveAt: '13:00' }, SKYTREE]
		});
		const sensoji = data.destinations.find((d: { name: string }) => d.name === '浅草寺');
		expect(sensoji.arrivalTime).toBe('13:00');
		expect(sensoji.arriveAt).toBe('13:00');
	});

	it('間に合わない訪問時刻はsummaryで知らせる', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, arriveAt: '08:00' }, SKYTREE],
			startTime: '10:00'
		});
		expect(data.summary).toContain('浅草寺は希望の08:00に間に合わず');
	});

	it('時間帯の指定がある目的地はその時間帯に配置する', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, timeSlot: 'night' }, SKYTREE]
		});
		const sensoji = data.destinations.find((d: { name: string }) => d.name === '浅草寺');
		expect(sensoji.arrivalTime >= '17:00').toBe(true);
		expect(sensoji.timeSlot).toBe('night');
		expect(data.destinations[1].name).toBe('浅草寺');
	});

	it('収まらない時間帯はsummaryで知らせる', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, timeSlot: 'morning' }, SKYTREE],
			startTime: '16:00'
		});
		expect(data.summary).toContain('浅草寺は希望の時間帯（朝）に収まりませんでした');
	});

	it('終点を指定すると最後の目的地から終点への到着時刻をsummaryに含める', async () => {
		const data = await postJson({ locations: TWO_LOCATIONS, endDestination: TOKYO_STATION });
		expect(data.summary).toMatch(/\d{2}:\d{2}頃に東京駅に到着します/);
		expect(data.endDestination).toEqual(TOKYO_STATION);
	});
});

describe('POST /api/route 移動手段', () => {
	it.each([
		['car', /^車で約\d+分$/],
		['walking', /^徒歩で約\d+分$/],
		['transit', /^電車・バスで約\d+分$/]
	])('%s は区間の移動時間をその手段で表記する', async (transportMode, pattern) => {
		const data = await postJson({ locations: [TOKYO_TOWER, SKYTREE], transportMode });
		expect(data.destinations[1].travelTimeFromPrevious).toMatch(pattern);
		expect(data.destinations[1].transitRoute).toBeNull();
		expect(data.transportMode).toBe(transportMode);
	});

	it('未知の移動手段は指定なしとして扱いnullで返す', async () => {
		const data = await postJson({ locations: TWO_LOCATIONS, transportMode: 'helicopter' });
		expect(data.transportMode).toBeNull();
	});

	it('移動手段が未指定なら近距離は徒歩で見積もる', async () => {
		const near = { ...SENSOJI, name: '雷門', location: { lat: 35.7111, lng: 139.7963 } };
		const data = await postJson({ locations: [SENSOJI, near] });
		expect(data.destinations[1].travelTimeFromPrevious).toMatch(/^徒歩で約\d+分$/);
	});
});

describe('POST /api/route レスポンス整形', () => {
	it('結果画面・保存APIが期待する形で返す', async () => {
		const data = await postJson({
			locations: TWO_LOCATIONS,
			origin: TOKYO_STATION,
			transportMode: 'transit',
			startTime: '09:00'
		});
		expect(data).toMatchObject({
			origin: TOKYO_STATION,
			transportMode: 'transit',
			startTime: '09:00',
			endDestination: null,
			planDate: null,
			summary: expect.stringContaining('2か所を巡るプランです')
		});
		for (const d of data.destinations) {
			expect(d).toMatchObject({
				order: expect.any(Number),
				name: expect.any(String),
				displayAddress: expect.any(String),
				arrivalTime: expect.stringMatching(/^\d{2}:\d{2}$/),
				departureTime: expect.stringMatching(/^\d{2}:\d{2}$/),
				description: '',
				transitRoute: null,
				location: expect.any(Object)
			});
		}
	});

	it('未指定の入力条件はnullで返す', async () => {
		const data = await postJson({ locations: TWO_LOCATIONS });
		for (const d of data.destinations) {
			expect(d.timeSlot).toBeNull();
			expect(d.stayMinutes).toBeNull();
			expect(d.arriveAt).toBeNull();
		}
	});

	it('whitelist外の時間帯・滞在時間・訪問時刻はエコーバックしない', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, timeSlot: 'midnight', stayMinutes: 45, arriveAt: '25:00' }, SKYTREE]
		});
		const sensoji = data.destinations.find((d: { name: string }) => d.name === '浅草寺');
		expect(sensoji).toMatchObject({ timeSlot: null, stayMinutes: null, arriveAt: null });
	});

	it('訪問時刻と時間帯を両方指定した場合はtimeSlotをnullで返す（訪問時刻優先）', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, timeSlot: 'night', arriveAt: '10:00' }, SKYTREE]
		});
		const sensoji = data.destinations.find((d: { name: string }) => d.name === '浅草寺');
		expect(sensoji).toMatchObject({ timeSlot: null, arriveAt: '10:00', arrivalTime: '10:00' });
	});

	it('入力に含まれる余計なフィールドはレスポンスに混ぜない', async () => {
		const data = await postJson({
			locations: [{ ...SENSOJI, extra: 'x' }, SKYTREE],
			origin: { ...TOKYO_STATION, extra: 'x' }
		});
		expect(data.origin).toEqual(TOKYO_STATION);
		expect(data.destinations[0]).not.toHaveProperty('extra');
	});
});

describe('POST /api/route planDate（issue #73）', () => {
	it('有効なplanDateを渡すとレスポンスにそのまま返す', async () => {
		const data = await postJson({ locations: TWO_LOCATIONS, planDate: '2026-09-05' });
		expect(data.planDate).toBe('2026-09-05');
	});

	it('planDateの有無で訪問順序・スケジュールは変わらない', async () => {
		const without = await postJson({ locations: TWO_LOCATIONS });
		const withDate = await postJson({ locations: TWO_LOCATIONS, planDate: '2026-09-05' });
		expect(withDate.destinations).toEqual(without.destinations);
		expect(withDate.summary).toBe(without.summary);
	});

	it.each(['2026-02-30', '2026-9-5', '2026/09/05', '', 20260905, null, {}])(
		'不正なplanDate %s はレスポンスでnullになり200相当のレスポンスが返る（400にしない）',
		async (planDate) => {
			const res = await POST(eventWith({ locations: TWO_LOCATIONS, planDate }));
			expect(res.status).toBe(200);
			expect((await res.json()).planDate).toBeNull();
		}
	);
});
