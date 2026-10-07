/**
 * 外部 API を使わずに訪問順序とスケジュールを決める経路計画ロジック（issue #149）。
 *
 * 座標間の直線距離（haversine）に迂回係数と移動手段ごとの速度を掛けて区間の所要時間を概算し、
 * 「訪問時刻・時間帯の制約違反が最小 → 全行程の終了時刻が最早」となる訪問順序を探す。
 * 制約が無ければ終了時刻の最小化は移動時間合計の最小化と一致する。
 * 目的地が少ないときは全順列を枝刈り付きで探索して厳密解を、多いときは最近傍法 + 2-opt / Or-opt の局所探索で近似解を求める。
 */
import type { LatLng } from '$lib/stores/route';

export type TravelMode = 'transit' | 'car' | 'walking';
export type TimeSlot = 'morning' | 'noon' | 'night';

export interface PlannerStop {
	location: LatLng;
	timeSlot?: TimeSlot;
	stayMinutes?: number;
	/** 希望到着時刻（0時からの分） */
	arriveAtMinutes?: number;
}

export interface PlannerInput {
	stops: PlannerStop[];
	origin?: LatLng;
	end?: LatLng;
	/** 未指定なら区間ごとに徒歩か公共交通を選ぶ */
	transportMode?: TravelMode;
	/** 開始時刻（0時からの分） */
	startMinutes: number;
}

export interface Leg {
	mode: TravelMode;
	minutes: number;
}

export interface ScheduledStop {
	/** input.stops のインデックス */
	index: number;
	/** 前の地点からの移動。出発地未指定の1件目は null */
	legFromPrevious: Leg | null;
	arrivalMinutes: number;
	departureMinutes: number;
	/** 希望到着時刻に対する遅れ（分）。間に合っていれば 0 */
	arriveAtDelay: number;
	/** 希望時間帯に収まらなかったら true */
	timeSlotMissed: boolean;
}

export interface Plan {
	stops: ScheduledStop[];
	/** 最後の目的地から終点への移動。終点未指定なら null */
	legToEnd: Leg | null;
	endArrivalMinutes: number | null;
	totalTravelMinutes: number;
}

/** 滞在時間未指定の目的地に割り当てる滞在時間（分） */
export const DEFAULT_STAY_MINUTES = 60;

/** 時間帯の範囲（分）。定義は朝=6:00〜10:59 / 昼=11:00〜16:59 / 晩=17:00以降 */
const TIME_SLOT_WINDOWS: Record<TimeSlot, { start: number; end: number }> = {
	morning: { start: 6 * 60, end: 11 * 60 },
	noon: { start: 11 * 60, end: 17 * 60 },
	night: { start: 17 * 60, end: Infinity }
};

/** 移動手段ごとの概算パラメータ。道なりの距離 = 直線距離 × detour */
const MODE_PARAMS: Record<
	TravelMode,
	{ detour: number; kmPerHour: number; overheadMinutes: number }
> = {
	walking: { detour: 1.3, kmPerHour: 4.8, overheadMinutes: 0 },
	// 駐車・乗り降りの時間を加算
	car: { detour: 1.4, kmPerHour: 30, overheadMinutes: 5 },
	// 駅・バス停までの徒歩と待ち時間を加算
	transit: { detour: 1.3, kmPerHour: 25, overheadMinutes: 10 }
};

/** 公共交通・指定なしで、道なり距離がこれ以下なら徒歩にする（km） */
const WALKABLE_KM = 1.2;

/** 全順列探索で厳密解を求める上限件数。これを超えたら局所探索にする */
const EXACT_SEARCH_LIMIT = 8;

/** 制約違反1分を終了時刻何分ぶんの悪さとみなすか。違反の最小化を常に優先させるため十分大きくする */
const PENALTY_WEIGHT = 10_000;

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 2地点間の移動手段と所要時間（5分単位に切り上げ、最低5分）を概算する */
export function estimateLeg(from: LatLng, to: LatLng, mode?: TravelMode): Leg {
	const km = haversineKm(from, to);
	const chosen: TravelMode =
		mode === 'car' || mode === 'walking'
			? mode
			: km * MODE_PARAMS.walking.detour <= WALKABLE_KM
				? 'walking'
				: 'transit';
	const { detour, kmPerHour, overheadMinutes } = MODE_PARAMS[chosen];
	const raw = ((km * detour) / kmPerHour) * 60 + overheadMinutes;
	return { mode: chosen, minutes: Math.max(5, Math.ceil(raw / 5) * 5) };
}

interface Evaluation {
	plan: Plan;
	/** 小さいほど良い */
	cost: number;
}

/** 区間の所要時間を事前計算した行列。node: 0..n-1 = 目的地, n = 出発地, n+1 = 終点 */
type LegMatrix = (Leg | null)[][];

function buildLegMatrix(input: PlannerInput): LegMatrix {
	const points: (LatLng | undefined)[] = [
		...input.stops.map((s) => s.location),
		input.origin,
		input.end
	];
	return points.map((from) =>
		points.map((to) => (from && to ? estimateLeg(from, to, input.transportMode) : null))
	);
}

/** 1つの目的地に到着してからの処理。待ち時間・違反量・出発時刻を返す */
function visit(stop: PlannerStop, rawArrival: number) {
	let arrival = rawArrival;
	let arriveAtDelay = 0;
	let timeSlotMissed = false;
	const stay = stop.stayMinutes ?? DEFAULT_STAY_MINUTES;
	let penalty = 0;

	if (stop.arriveAtMinutes !== undefined) {
		// 早く着いたら指定時刻まで待つ。遅れた分だけ違反
		if (arrival < stop.arriveAtMinutes) arrival = stop.arriveAtMinutes;
		arriveAtDelay = arrival - stop.arriveAtMinutes;
		penalty += arriveAtDelay;
	} else if (stop.timeSlot) {
		// 時間帯の開始前に着いたら開始まで待つ。滞在の中央が時間帯の終わりを越えた分だけ違反
		const window = TIME_SLOT_WINDOWS[stop.timeSlot];
		if (arrival < window.start) arrival = window.start;
		const overrun = arrival + stay / 2 - window.end;
		if (overrun > 0) {
			timeSlotMissed = true;
			penalty += overrun;
		}
	}
	return { arrival, departure: arrival + stay, arriveAtDelay, timeSlotMissed, penalty };
}

/** complete=false は探索途中の部分順序の評価（終点への移動を含めず、枝刈りの下界に使う） */
function evaluate(
	order: number[],
	input: PlannerInput,
	legs: LegMatrix,
	complete = true
): Evaluation {
	const n = input.stops.length;
	const originNode = n;
	const endNode = n + 1;
	let time = input.startMinutes;
	let prev = input.origin ? originNode : -1;
	let penalty = 0;
	let totalTravelMinutes = 0;
	const stops: ScheduledStop[] = [];

	for (const index of order) {
		const leg = prev >= 0 ? legs[prev][index] : null;
		if (leg) {
			time += leg.minutes;
			totalTravelMinutes += leg.minutes;
		}
		const v = visit(input.stops[index], time);
		penalty += v.penalty;
		stops.push({
			index,
			legFromPrevious: leg,
			arrivalMinutes: v.arrival,
			departureMinutes: v.departure,
			arriveAtDelay: v.arriveAtDelay,
			timeSlotMissed: v.timeSlotMissed
		});
		time = v.departure;
		prev = index;
	}

	let legToEnd: Leg | null = null;
	let endArrivalMinutes: number | null = null;
	if (complete && input.end && prev >= 0) {
		legToEnd = legs[prev][endNode];
		if (legToEnd) {
			time += legToEnd.minutes;
			totalTravelMinutes += legToEnd.minutes;
			endArrivalMinutes = time;
		}
	}

	return {
		plan: { stops, legToEnd, endArrivalMinutes, totalTravelMinutes },
		cost: penalty * PENALTY_WEIGHT + time
	};
}

/** 全順列を探索する。時刻と違反量は単調増加なので、途中の評価が暫定最良以上なら枝を刈る */
function exactSearch(input: PlannerInput, legs: LegMatrix): Evaluation {
	const n = input.stops.length;
	let best: Evaluation | null = null;
	const order: number[] = [];
	const used = new Array<boolean>(n).fill(false);

	const dfs = () => {
		if (order.length === n) {
			const e = evaluate(order, input, legs);
			if (!best || e.cost < best.cost) best = { plan: e.plan, cost: e.cost };
			return;
		}
		if (best && order.length > 0 && evaluate(order, input, legs, false).cost >= best.cost) return;
		for (let i = 0; i < n; i++) {
			if (used[i]) continue;
			used[i] = true;
			order.push(i);
			dfs();
			order.pop();
			used[i] = false;
		}
	};
	dfs();
	return best!;
}

/** 最近傍法で初期解を作る。出発地が無ければ時刻指定の早い目的地（無ければ0番）から始める */
function nearestNeighborOrder(input: PlannerInput, legs: LegMatrix): number[] {
	const n = input.stops.length;
	const remaining = new Set(Array.from({ length: n }, (_, i) => i));
	const order: number[] = [];
	let prev = input.origin ? n : -1;
	if (prev < 0) {
		let first = 0;
		for (const i of remaining) {
			const t = input.stops[i].arriveAtMinutes ?? Infinity;
			if (t < (input.stops[first].arriveAtMinutes ?? Infinity)) first = i;
		}
		order.push(first);
		remaining.delete(first);
		prev = first;
	}
	while (remaining.size > 0) {
		let next = -1;
		let nextMinutes = Infinity;
		for (const i of remaining) {
			const m = legs[prev][i]?.minutes ?? Infinity;
			if (m < nextMinutes) {
				next = i;
				nextMinutes = m;
			}
		}
		order.push(next);
		remaining.delete(next);
		prev = next;
	}
	return order;
}

/** 2-opt（区間反転）と Or-opt（1件の移動）を、改善が無くなるまで繰り返す */
function localSearch(input: PlannerInput, legs: LegMatrix): Evaluation {
	let order = nearestNeighborOrder(input, legs);
	let best = evaluate(order, input, legs);
	const n = order.length;
	let improved = true;
	while (improved) {
		improved = false;
		for (let i = 0; i < n - 1; i++) {
			for (let j = i + 1; j < n; j++) {
				const reversed = [
					...order.slice(0, i),
					...order.slice(i, j + 1).reverse(),
					...order.slice(j + 1)
				];
				const e = evaluate(reversed, input, legs);
				if (e.cost < best.cost) {
					order = reversed;
					best = e;
					improved = true;
				}
			}
		}
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) {
				if (i === j) continue;
				const moved = [...order];
				const [item] = moved.splice(i, 1);
				moved.splice(j, 0, item);
				const e = evaluate(moved, input, legs);
				if (e.cost < best.cost) {
					order = moved;
					best = e;
					improved = true;
				}
			}
		}
	}
	return best;
}

export function planRoute(input: PlannerInput): Plan {
	if (input.stops.length === 0) {
		return { stops: [], legToEnd: null, endArrivalMinutes: null, totalTravelMinutes: 0 };
	}
	const legs = buildLegMatrix(input);
	const result =
		input.stops.length <= EXACT_SEARCH_LIMIT ? exactSearch(input, legs) : localSearch(input, legs);
	return result.plan;
}

/** リクエストで受け取った座標が有効な緯度経度か判定する */
export function isLatLng(value: unknown): value is LatLng {
	if (!value || typeof value !== 'object') return false;
	const { lat, lng } = value as Record<string, unknown>;
	return (
		typeof lat === 'number' &&
		typeof lng === 'number' &&
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		Math.abs(lat) <= 90 &&
		Math.abs(lng) <= 180
	);
}
