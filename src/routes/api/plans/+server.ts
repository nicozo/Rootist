import { json, error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { plans } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';
import type { RouteDestination, RouteResult } from '$lib/stores/route';

// 保存時に受け入れる既知フィールドのみを対象とする（任意の巨大キー混入防止）
const DESTINATION_KEYS = [
	'order',
	'name',
	'displayAddress',
	'arrivalTime',
	'departureTime',
	'description',
	'travelTimeFromPrevious',
	'transitRoute',
	'timeSlot'
] as const satisfies readonly (keyof RouteDestination)[];

const MAX_BODY_BYTES = 100 * 1024;

function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

function isValidDestination(d: unknown): d is RouteDestination {
	if (!d || typeof d !== 'object') return false;
	const rec = d as Record<string, unknown>;
	const orderOk = typeof rec.order === 'number' && Number.isFinite(rec.order) && rec.order > 0;
	return (
		orderOk &&
		isNonEmptyString(rec.name) &&
		isNonEmptyString(rec.displayAddress) &&
		isNonEmptyString(rec.arrivalTime) &&
		isNonEmptyString(rec.departureTime)
	);
}

// each_key_duplicate（plan-timeline.svelte の {#each ... (dest.order)}）を防ぐため、
// destinations 間で order が重複していないことを検証する。
function hasUniqueOrders(destinations: unknown[]): boolean {
	const orders = destinations.map((d) => (d as Record<string, unknown>).order);
	return new Set(orders).size === orders.length;
}

function pickDestination(d: Record<string, unknown>): RouteDestination {
	const picked = {} as Record<string, unknown>;
	for (const key of DESTINATION_KEYS) {
		if (key in d) picked[key] = d[key];
	}
	return picked as unknown as RouteDestination;
}

function pickPlace(v: unknown): { name: string; displayAddress: string } | undefined {
	if (!v || typeof v !== 'object') return undefined;
	const rec = v as Record<string, unknown>;
	if (!isNonEmptyString(rec.name) || !isNonEmptyString(rec.displayAddress)) return undefined;
	return { name: rec.name, displayAddress: rec.displayAddress };
}

export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await request.text();

	if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
		error(400, 'リクエストボディが大きすぎます');
	}

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		error(400, '不正なJSON形式です');
	}

	if (!body || typeof body !== 'object') {
		error(400, '不正なリクエストです');
	}

	const rec = body as Record<string, unknown>;
	const destinationsInput = rec.destinations;

	if (!Array.isArray(destinationsInput) || destinationsInput.length === 0) {
		error(400, 'destinations は1件以上必要です');
	}

	if (!destinationsInput.every(isValidDestination)) {
		error(400, 'destinations の形式が不正です');
	}

	if (!hasUniqueOrders(destinationsInput)) {
		error(400, 'destinations の order が重複しています');
	}

	const destinations = destinationsInput.map((d) =>
		pickDestination(d as unknown as Record<string, unknown>)
	);

	const data: RouteResult = {
		destinations,
		summary: isNonEmptyString(rec.summary) ? rec.summary : '',
		origin: pickPlace(rec.origin),
		transportMode: typeof rec.transportMode === 'string' ? rec.transportMode : null,
		startTime: typeof rec.startTime === 'string' ? rec.startTime : null,
		endDestination: pickPlace(rec.endDestination) ?? null
	};

	const shareId = randomUUID();

	try {
		await db.insert(plans).values({ shareId, data });
	} catch (e) {
		console.error('[POST /api/plans] DB insert failed:', e);
		error(500, 'プランの保存に失敗しました');
	}

	return json({ shareId }, { status: 201 });
};
