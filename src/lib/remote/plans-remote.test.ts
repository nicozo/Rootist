import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #62: プラン保存APIの単体テスト。DBへは実接続せず保存関数(insertPlan)をモックする。
// issue #128: ORMをやめ、plansへの保存は #lib/server/db/plans に集約した。

const { insertPlan } = vi.hoisted(() => ({ insertPlan: vi.fn() }));

vi.mock('#lib/server/db/plans.js', () => ({ insertPlan }));

vi.mock('$app/server', async () =>
	(await import('#lib/server/test-utils/remote-call.js')).createAppServerModule()
);

// 本物の remote module を、スキーマ検証 → 本体の経路で呼ぶ（issue #159）。
// 旧 POST ハンドラのテストの assertion を保つため、戻り値は Response に包んで返す。
const { savePlan } = await import('#lib/remote/plans.remote.js');
const { callRemote } = await import('#lib/server/test-utils/remote-call.js');

const POST = async (arg: unknown) => Response.json(await callRemote(savePlan, arg));

/** remote function の引数（移行前は JSON 本文だったもの）。 */
function jsonEvent(body: unknown) {
	return body;
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
	insertPlan.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('savePlan バリデーション', () => {
	// D4: 移行後は引数が解析済みで届くため、「受け取った引数全体（正規化前・未知キーを含む）を JSON にした
	// UTF-8 バイト数」が 102,400 を超えたら拒否する。生の本文の解析前判定は framework 側の責務になった。
	it('100KBを超えるボディを拒否する', async () => {
		const huge = { destinations: [destination(1, { description: 'a'.repeat(100 * 1024) })] };

		await expect(POST(jsonEvent(huge))).rejects.toMatchObject({
			status: 400,
			body: { message: 'リクエストボディが大きすぎます' }
		});
		expect(insertPlan).not.toHaveBeenCalled();
	});

	// D2: S3・S4・S5 は境界のスキーマで弾く（ステータス 400 は維持。文言は framework 既定の 'Bad Request'）
	it('nullボディを拒否する', async () => {
		await expect(POST(jsonEvent(null))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Bad Request' }
		});
	});

	it('オブジェクト以外のボディを拒否する', async () => {
		await expect(POST(jsonEvent('文字列'))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Bad Request' }
		});
	});

	it('destinationsが配列でない場合を拒否する', async () => {
		await expect(POST(jsonEvent({ destinations: 'not-array' }))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Bad Request' }
		});
	});

	it('destinationsが空配列の場合を拒否する', async () => {
		await expect(POST(jsonEvent({ destinations: [] }))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Bad Request' }
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
			body: { message: 'Bad Request' }
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

describe('savePlan 保存', () => {
	// D2: 成功ステータス 201 は戻り値では表現できない（呼び出し元は 201 を見ていない）。shareId を返すことを確認する
	it('shareIdを発行して返す', async () => {
		const res = await POST(jsonEvent({ destinations: [destination(1)], summary: '概要' }));

		const { shareId } = await res.json();
		expect(shareId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(insertPlan).toHaveBeenCalledWith(shareId, expect.objectContaining({ summary: '概要' }));
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

		const saved = insertPlan.mock.calls[0][1];
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

		expect(insertPlan.mock.calls[0][1].summary).toBe('');
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

		const saved = insertPlan.mock.calls[0][1];
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

		const saved = insertPlan.mock.calls[0][1];
		expect(saved.origin).toBeUndefined();
		expect(saved.endDestination).toBeNull();
	});

	it('transportMode/startTimeが文字列でない場合はnullにする', async () => {
		await POST(
			jsonEvent({ destinations: [destination(1)], transportMode: 1, startTime: { at: 9 } })
		);

		const saved = insertPlan.mock.calls[0][1];
		expect(saved.transportMode).toBeNull();
		expect(saved.startTime).toBeNull();
	});

	it('planDateを含むボディをPOSTすると保存されたdata.planDateがその値になる', async () => {
		await POST(jsonEvent({ destinations: [destination(1)], planDate: '2026-09-05' }));

		expect(insertPlan.mock.calls[0][1].planDate).toBe('2026-09-05');
	});

	it('planDate未指定なら保存data.planDateはnull', async () => {
		await POST(jsonEvent({ destinations: [destination(1)] }));

		expect(insertPlan.mock.calls[0][1].planDate).toBeNull();
	});

	it.each(['2026-02-30', '2026/09/05', 123, {}])(
		'不正なplanDate %s は保存data.planDateをnullにし、保存自体は成功する（shareIdを返す）',
		async (planDate) => {
			const res = await POST(jsonEvent({ destinations: [destination(1)], planDate }));

			expect((await res.json()).shareId).toEqual(expect.any(String));
			expect(insertPlan.mock.calls[0][1].planDate).toBeNull();
		}
	);

	it('DB insertが失敗したら500を投げ、DBの生エラーは返さない', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const dbError = new Error('ER_DUP_ENTRY: secret table detail');
		insertPlan.mockRejectedValue(dbError);

		let err: unknown;
		try {
			await POST(jsonEvent({ destinations: [destination(1)] }));
		} catch (e) {
			err = e;
		}

		expect(err).toMatchObject({ status: 500, body: { message: 'プランの保存に失敗しました' } });
		expect(JSON.stringify(err)).not.toContain('secret table detail');
		// ログ接頭辞は保存を担う関数名（savePlan）に揃えた（旧: 旧パスを含む接頭辞。issue #159）。引数の並びは変えない
		expect(errorSpy).toHaveBeenCalledWith('[savePlan] DB insert failed:', dbError);
	});
});

// issue #159 D4: 保存サイズの判定は「受け取った引数全体（正規化前・未知キーを含む）の JSON の UTF-8 バイト数」
describe('savePlan 保存サイズ上限（D4）', () => {
	const LIMIT = 102_400;
	const byteLength = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength;

	/** 指定バイト数ちょうどになるまで、与えた関数で作る body の水増し文字列長を調整する。 */
	function fillTo(target: number, build: (pad: string) => unknown) {
		const base = byteLength(build(''));
		const body = build('a'.repeat(target - base));
		expect(byteLength(body)).toBe(target);
		return body;
	}

	it('ちょうど 102,400 バイトは受理され、保存される', async () => {
		const body = fillTo(LIMIT, (pad) => ({
			destinations: [destination(1, { description: pad })]
		}));
		expect(byteLength(body)).toBe(102400);

		await POST(jsonEvent(body));

		expect(insertPlan).toHaveBeenCalledTimes(1);
	});

	it('102,401 バイトは 400 で拒否され、保存されない', async () => {
		const body = fillTo(LIMIT + 1, (pad) => ({
			destinations: [destination(1, { description: pad })]
		}));

		await expect(POST(jsonEvent(body))).rejects.toMatchObject({
			status: 400,
			body: { message: 'リクエストボディが大きすぎます' }
		});
		expect(insertPlan).not.toHaveBeenCalled();
	});

	it('外側の未知キーだけで水増しした超過も拒否される（正規化前で測っている）', async () => {
		const body = fillTo(LIMIT + 1, (pad) => ({ destinations: [destination(1)], injected: pad }));

		await expect(POST(jsonEvent(body))).rejects.toMatchObject({
			status: 400,
			body: { message: 'リクエストボディが大きすぎます' }
		});
		expect(insertPlan).not.toHaveBeenCalled();
	});

	it('destinations[0] の未知キーだけで水増しした超過も拒否される', async () => {
		const body = fillTo(LIMIT + 1, (pad) => ({
			destinations: [destination(1, { injected: pad })]
		}));

		await expect(POST(jsonEvent(body))).rejects.toMatchObject({
			status: 400,
			body: { message: 'リクエストボディが大きすぎます' }
		});
		expect(insertPlan).not.toHaveBeenCalled();
	});

	it('文字数は 102,400 以下でもバイト数が超える日本語は拒否される', async () => {
		const chars = 40_000;
		const body = { destinations: [destination(1, { description: 'あ'.repeat(chars) })] };
		expect(JSON.stringify(body).length).toBeLessThanOrEqual(LIMIT);
		expect(byteLength(body)).toBeGreaterThan(LIMIT);

		await expect(POST(jsonEvent(body))).rejects.toMatchObject({
			status: 400,
			body: { message: 'リクエストボディが大きすぎます' }
		});
		expect(insertPlan).not.toHaveBeenCalled();
	});
});

// issue #159: remote functions の引数は devalue で運ばれ、JSON で表せない値も届きうる。
// 移行前（JSON 本文）の受理集合と同じにするため、境界で 400 にする。
describe('savePlan JSON で表せない値の拒否', () => {
	it.each([
		['未知キーに BigInt', { destinations: [destination(1)], extra: 10n }],
		[
			'description に Map',
			{ destinations: [destination(1, { description: new Map([['a', 1]]) })] }
		],
		['arrivalTime に Date', { destinations: [destination(1, { arrivalTime: new Date() })] }],
		['description に NaN', { destinations: [destination(1, { description: Number.NaN })] }],
		[
			'description に File',
			{ destinations: [destination(1, { description: new File(['x'], 'a.txt') })] }
		],
		['未知キーに Set', { destinations: [destination(1)], extra: new Set([1]) }],
		['description に Infinity', { destinations: [destination(1, { description: Infinity })] }]
	])('%s は 400 で拒否され、保存されない', async (_label, body) => {
		await expect(POST(jsonEvent(body))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Bad Request' }
		});
		expect(insertPlan).not.toHaveBeenCalled();
	});

	it('循環参照は 400 で拒否される（再帰が溢れない）', async () => {
		const loop: Record<string, unknown> = {};
		loop.self = loop;

		await expect(POST(jsonEvent({ destinations: [destination(1)], loop }))).rejects.toMatchObject({
			status: 400
		});
		expect(insertPlan).not.toHaveBeenCalled();
	});

	it('undefined の値はキーが無いのと同じに受理される（陽性対照）', async () => {
		await POST(jsonEvent({ destinations: [destination(1)], summary: undefined }));

		expect(insertPlan.mock.calls[0][1].summary).toBe('');
	});
});

describe('savePlan 登録されたスキーマ', () => {
	it('検証を省略せず、スキーマが登録されている', async () => {
		const { assertSchemaRegistered } = await import('#lib/server/test-utils/remote-call.js');

		expect(() => assertSchemaRegistered(savePlan)).not.toThrow();
	});
});
