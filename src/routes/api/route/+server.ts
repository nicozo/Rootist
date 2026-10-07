import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { LatLng, Place, RouteDestination } from '$lib/stores/route';
import { isStayMinutesPreset } from '$lib/stay-minutes';
import { isVisitTime, parseTimeToMinutes } from '$lib/visit-time';
import { isPlanDate } from '$lib/plan-date';
import {
	isLatLng,
	planRoute,
	type Leg,
	type TimeSlot,
	type TravelMode
} from '$lib/server/route-planner';

interface Location {
	name: string;
	displayAddress: string;
	location?: LatLng;
	timeSlot?: TimeSlot;
	stayMinutes?: number;
	arriveAt?: string;
}

const TRANSPORT_MODES = new Set<TravelMode>(['transit', 'car', 'walking']);
const TIME_SLOTS = new Set<TimeSlot>(['morning', 'noon', 'night']);
const TIME_SLOT_JA: Record<TimeSlot, string> = { morning: '朝', noon: '昼', night: '晩' };
const DEFAULT_START_TIME = '09:00';

/** 0時からの分数を "HH:MM" にする（日をまたいだら24時間で折り返す） */
function formatMinutes(minutes: number): string {
	const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function formatLeg(leg: Leg): string {
	switch (leg.mode) {
		case 'walking':
			return `徒歩で約${leg.minutes}分`;
		case 'car':
			return `車で約${leg.minutes}分`;
		case 'transit':
			return `電車・バスで約${leg.minutes}分`;
	}
}

/** 名前・住所・座標がそろった地点だけを受け付ける（座標が無いと順序を計算できない） */
function pickPlace(v: Location): Place & { location: LatLng } {
	if (!v || !isLatLng(v.location)) error(400, '位置情報が取得できていない場所があります');
	return {
		name: String(v.name ?? ''),
		displayAddress: String(v.displayAddress ?? ''),
		location: { lat: v.location.lat, lng: v.location.lng }
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const {
		locations,
		origin: originInput,
		transportMode: transportModeInput,
		startTime: startTimeInput,
		endDestination: endDestinationInput,
		planDate
	}: {
		locations: Location[];
		origin?: Location;
		transportMode?: string;
		startTime?: string;
		endDestination?: Location;
		planDate?: string;
	} = await request.json();

	if (!Array.isArray(locations) || locations.length < 2) {
		error(400, '2件以上の目的地が必要です');
	}

	const validPlanDate = isPlanDate(planDate) ? planDate : undefined;
	const transportMode = TRANSPORT_MODES.has(transportModeInput as TravelMode)
		? (transportModeInput as TravelMode)
		: undefined;
	const startTime = isVisitTime(startTimeInput) ? startTimeInput : undefined;
	const origin = originInput ? pickPlace(originInput) : undefined;
	const endDestination = endDestinationInput ? pickPlace(endDestinationInput) : undefined;

	// 時間帯・滞在時間・訪問時刻はホワイトリスト外を無視する
	const normalizedLocations = locations.map((l) => {
		const place = pickPlace(l);
		const arriveAt = isVisitTime(l.arriveAt) ? l.arriveAt : undefined;
		return {
			...place,
			// 訪問時刻は時間帯より強い指定なので、両方来た場合は時刻を優先し時間帯は捨てる
			timeSlot: !arriveAt && l.timeSlot && TIME_SLOTS.has(l.timeSlot) ? l.timeSlot : undefined,
			stayMinutes: isStayMinutesPreset(l.stayMinutes) ? l.stayMinutes : undefined,
			arriveAt
		};
	});

	const startMinutes = parseTimeToMinutes(startTime ?? DEFAULT_START_TIME)!;
	const plan = planRoute({
		stops: normalizedLocations.map((l) => ({
			location: l.location,
			timeSlot: l.timeSlot,
			stayMinutes: l.stayMinutes,
			arriveAtMinutes: l.arriveAt ? (parseTimeToMinutes(l.arriveAt) ?? undefined) : undefined
		})),
		origin: origin?.location,
		end: endDestination?.location,
		transportMode,
		startMinutes
	});

	const destinations: RouteDestination[] = plan.stops.map((s, i) => {
		const l = normalizedLocations[s.index];
		return {
			order: i + 1,
			name: l.name,
			displayAddress: l.displayAddress,
			arrivalTime: formatMinutes(s.arrivalMinutes),
			departureTime: formatMinutes(s.departureMinutes),
			description: '',
			travelTimeFromPrevious: s.legFromPrevious ? formatLeg(s.legFromPrevious) : null,
			transitRoute: null,
			timeSlot: l.timeSlot ?? null,
			stayMinutes: l.stayMinutes ?? null,
			arriveAt: l.arriveAt ?? null,
			location: l.location
		};
	});

	const last = plan.stops[plan.stops.length - 1];
	const finishLine =
		plan.endArrivalMinutes !== null && endDestination
			? `${formatMinutes(plan.endArrivalMinutes)}頃に${endDestination.name}に到着します。`
			: `${formatMinutes(last.departureMinutes)}頃に最後の目的地を出発します。`;
	const unmet = plan.stops.flatMap((s) => {
		const l = normalizedLocations[s.index];
		if (s.arriveAtDelay > 0) {
			return [
				`${l.name}は希望の${l.arriveAt}に間に合わず、${formatMinutes(s.arrivalMinutes)}着になります。`
			];
		}
		if (s.timeSlotMissed && l.timeSlot) {
			return [`${l.name}は希望の時間帯（${TIME_SLOT_JA[l.timeSlot]}）に収まりませんでした。`];
		}
		return [];
	});
	const summary = [
		`${destinations.length}か所を巡るプランです。${startTime ?? DEFAULT_START_TIME}に出発し、${finishLine}`,
		`移動時間は合計約${plan.totalTravelMinutes}分です（距離からの概算）。`,
		...unmet
	].join('');

	return json({
		destinations,
		summary,
		origin,
		transportMode: transportMode ?? null,
		startTime: startTime ?? null,
		endDestination: endDestination ?? null,
		planDate: validPlanDate ?? null
	});
};
