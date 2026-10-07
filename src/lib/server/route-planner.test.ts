import { describe, expect, it } from 'vite-plus/test';
import {
	DEFAULT_STAY_MINUTES,
	estimateLeg,
	haversineKm,
	isLatLng,
	planRoute,
	type PlannerStop
} from './route-planner';

// issue #149: 外部APIを使わない訪問順序・スケジュール計算のテスト。

/** 東西一直線（緯度35度）上に経度0.01度刻み（約0.9km）で並べた地点 */
function onLine(step: number) {
	return { lat: 35, lng: 139 + step * 0.01 };
}

function stop(step: number, extra: Partial<PlannerStop> = {}): PlannerStop {
	return { location: onLine(step), ...extra };
}

const NINE = 9 * 60;

function visitedSteps(stops: PlannerStop[], order: { index: number }[]) {
	return order.map((s) => stops[s.index].location.lng);
}

describe('haversineKm', () => {
	it('同じ地点は0km', () => {
		expect(haversineKm(onLine(0), onLine(0))).toBe(0);
	});

	it('東京駅〜大阪駅はおよそ400km', () => {
		const km = haversineKm({ lat: 35.6812, lng: 139.7671 }, { lat: 34.7025, lng: 135.4959 });
		expect(km).toBeGreaterThan(395);
		expect(km).toBeLessThan(410);
	});
});

describe('estimateLeg', () => {
	it('所要時間は5分単位に切り上げ、最低5分', () => {
		const leg = estimateLeg(onLine(0), onLine(0), 'walking');
		expect(leg).toEqual({ mode: 'walking', minutes: 5 });
		expect(estimateLeg(onLine(0), onLine(10), 'car').minutes % 5).toBe(0);
	});

	it('公共交通でも徒歩圏なら徒歩にする', () => {
		expect(estimateLeg(onLine(0), onLine(0.5), 'transit').mode).toBe('walking');
		expect(estimateLeg(onLine(0), onLine(10), 'transit').mode).toBe('transit');
	});

	it('移動手段の指定が無ければ距離で徒歩か公共交通を選ぶ', () => {
		expect(estimateLeg(onLine(0), onLine(0.5)).mode).toBe('walking');
		expect(estimateLeg(onLine(0), onLine(10)).mode).toBe('transit');
	});

	it('車・徒歩の指定は距離に関わらずその手段で見積もる', () => {
		expect(estimateLeg(onLine(0), onLine(10), 'walking').mode).toBe('walking');
		expect(estimateLeg(onLine(0), onLine(0.1), 'car').mode).toBe('car');
	});

	it('遠いほど時間がかかる', () => {
		const near = estimateLeg(onLine(0), onLine(5), 'car').minutes;
		const far = estimateLeg(onLine(0), onLine(20), 'car').minutes;
		expect(far).toBeGreaterThan(near);
	});
});

describe('planRoute 訪問順序', () => {
	it('出発地からの往復が無駄にならない順（一直線上を端から順）に並べる', () => {
		const stops = [stop(3), stop(1), stop(4), stop(2)];
		const plan = planRoute({ stops, origin: onLine(0), transportMode: 'car', startMinutes: NINE });
		expect(visitedSteps(stops, plan.stops)).toEqual([1, 2, 3, 4].map((s) => onLine(s).lng));
	});

	it('終点を指定すると終点側に向かって巡る', () => {
		const stops = [stop(1), stop(2), stop(3)];
		const plan = planRoute({
			stops,
			origin: onLine(2),
			end: onLine(0),
			transportMode: 'car',
			startMinutes: NINE
		});
		// 2 → 3 → 1 → 終点0 が、2 → 1 → 3 → 0 より短い
		expect(visitedSteps(stops, plan.stops)).toEqual([2, 3, 1].map((s) => onLine(s).lng));
		expect(plan.legToEnd).not.toBeNull();
		expect(plan.endArrivalMinutes).toBeGreaterThan(plan.stops[2].departureMinutes);
	});

	it('出発地が無ければ1件目は移動なしで開始時刻に到着する', () => {
		const plan = planRoute({ stops: [stop(0), stop(5)], startMinutes: NINE });
		expect(plan.stops[0].legFromPrevious).toBeNull();
		expect(plan.stops[0].arrivalMinutes).toBe(NINE);
	});

	it('全ての目的地をちょうど1回ずつ訪れる（局所探索になる件数でも）', () => {
		const stops = Array.from({ length: 12 }, (_, i) => stop((i * 7) % 12));
		const plan = planRoute({ stops, origin: onLine(-1), transportMode: 'car', startMinutes: NINE });
		expect(plan.stops.map((s) => s.index).sort((a, b) => a - b)).toEqual(
			Array.from({ length: 12 }, (_, i) => i)
		);
		// 一直線上なので端から順に巡るのが最短
		expect(visitedSteps(stops, plan.stops)).toEqual(
			Array.from({ length: 12 }, (_, i) => onLine(i).lng)
		);
	});
});

describe('planRoute スケジュール', () => {
	it('滞在時間の指定が無ければ既定の滞在時間を割り当て、到着〜出発に移動時間を挟む', () => {
		const plan = planRoute({
			stops: [stop(0), stop(5)],
			transportMode: 'car',
			startMinutes: NINE
		});
		const [first, second] = plan.stops;
		expect(first.departureMinutes - first.arrivalMinutes).toBe(DEFAULT_STAY_MINUTES);
		expect(second.arrivalMinutes).toBe(first.departureMinutes + second.legFromPrevious!.minutes);
		expect(plan.totalTravelMinutes).toBe(second.legFromPrevious!.minutes);
	});

	it('滞在時間の指定どおりに滞在する', () => {
		const plan = planRoute({
			stops: [stop(0, { stayMinutes: 120 }), stop(1, { stayMinutes: 30 })],
			startMinutes: NINE
		});
		for (const s of plan.stops) {
			const expected = s.index === 0 ? 120 : 30;
			expect(s.departureMinutes - s.arrivalMinutes).toBe(expected);
		}
	});

	it('訪問時刻の指定がある目的地はその時刻に到着し、早く着いたら待つ', () => {
		const stops = [stop(0), stop(1, { arriveAtMinutes: 14 * 60 })];
		const plan = planRoute({ stops, transportMode: 'car', startMinutes: NINE });
		const target = plan.stops.find((s) => s.index === 1)!;
		expect(target.arrivalMinutes).toBe(14 * 60);
		expect(target.arriveAtDelay).toBe(0);
	});

	it('訪問時刻を守るためなら遠回りの順序を選ぶ', () => {
		// 距離だけなら 1 → 2 だが、遠い 2 に 9:30 着の指定があるので先に行く
		const stops = [stop(1), stop(2, { arriveAtMinutes: 9 * 60 + 30 })];
		const plan = planRoute({ stops, origin: onLine(0), transportMode: 'car', startMinutes: NINE });
		expect(plan.stops[0].index).toBe(1);
		expect(plan.stops[0].arriveAtDelay).toBe(0);
	});

	it('開始時刻より前の訪問時刻には間に合わず、遅れを記録する', () => {
		const plan = planRoute({
			stops: [stop(0, { arriveAtMinutes: 8 * 60 }), stop(1)],
			startMinutes: NINE
		});
		const late = plan.stops.find((s) => s.index === 0)!;
		expect(late.arriveAtDelay).toBe(60);
	});

	it('時間帯の指定がある目的地はその時間帯に配置する', () => {
		// 晩指定の0を先に回ると時間帯外（朝）になるので、最後に回して17時まで待つ
		const stops = [stop(0, { timeSlot: 'night' }), stop(1), stop(2)];
		const plan = planRoute({ stops, transportMode: 'car', startMinutes: NINE });
		const night = plan.stops.find((s) => s.index === 0)!;
		expect(night.arrivalMinutes).toBeGreaterThanOrEqual(17 * 60);
		expect(night.timeSlotMissed).toBe(false);
		expect(plan.stops[plan.stops.length - 1].index).toBe(0);
	});

	it('開始が遅く朝の時間帯に収まらない場合は満たせなかったと記録する', () => {
		const plan = planRoute({
			stops: [stop(0, { timeSlot: 'morning' }), stop(1)],
			startMinutes: 15 * 60
		});
		expect(plan.stops.find((s) => s.index === 0)!.timeSlotMissed).toBe(true);
	});
});

describe('isLatLng', () => {
	it('範囲内の数値の組だけを受け付ける', () => {
		expect(isLatLng({ lat: 35, lng: 139 })).toBe(true);
		expect(isLatLng({ lat: 91, lng: 139 })).toBe(false);
		expect(isLatLng({ lat: 35, lng: -181 })).toBe(false);
		expect(isLatLng({ lat: '35', lng: 139 })).toBe(false);
		expect(isLatLng({ lat: NaN, lng: 139 })).toBe(false);
		expect(isLatLng(null)).toBe(false);
		expect(isLatLng(undefined)).toBe(false);
	});
});
