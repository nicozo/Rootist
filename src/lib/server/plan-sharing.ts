import { error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { insertPlan } from '#lib/server/db/plans.js';
import type { RouteDestination, RouteResult } from '#lib/stores/route.js';
import type { SavePlanInput } from '#lib/schemas/plans.js';
import { isPlanDate } from '#lib/plan-date.js';

// 保存時に受け入れる既知フィールドのみを対象とする（任意の巨大キー混入防止）。
// RouteDestination のキーと食い違うと pnpm check が落ちる。
const DESTINATION_KEYS = [
	'order',
	'name',
	'displayAddress',
	'arrivalTime',
	'departureTime',
	'description',
	'travelTimeFromPrevious',
	'transitRoute',
	'timeSlot',
	'stayMinutes',
	'arriveAt'
] as const satisfies readonly (keyof RouteDestination)[];

/** 受け取った引数全体（正規化前・未知キーを含む）を JSON にしたときの UTF-8 バイト数の上限。 */
const MAX_BODY_BYTES = 100 * 1024;

function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

// each_key_duplicate（plan-timeline.svelte の {#each ... (dest.order)}）を防ぐため、
// destinations 間で order が重複していないことを検証する。
function hasUniqueOrders(destinations: readonly { order: number }[]): boolean {
	const orders = destinations.map((d) => d.order);
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

/**
 * 生成結果をプランとして保存し、共有 ID を返す（issue #159 で remote function の本体として移設）。
 * 形式の検査（destinations の必須項目・JSON で表せる値のみ）は境界のスキーマ（`#lib/schemas/plans.js`）が行い、
 * ここでは文言を維持する業務ルール（サイズ・order 重複）と正規化・保存を行う。
 */
export async function savePlan(input: SavePlanInput): Promise<{ shareId: string }> {
	if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_BODY_BYTES) {
		error(400, 'リクエストボディが大きすぎます');
	}

	if (!hasUniqueOrders(input.destinations)) {
		error(400, 'destinations の order が重複しています');
	}

	const rec = input as Record<string, unknown>;

	const destinations = input.destinations.map((d) =>
		pickDestination(d as unknown as Record<string, unknown>)
	);

	const data: RouteResult = {
		destinations,
		summary: isNonEmptyString(rec.summary) ? rec.summary : '',
		origin: pickPlace(rec.origin),
		transportMode: typeof rec.transportMode === 'string' ? rec.transportMode : null,
		startTime: typeof rec.startTime === 'string' ? rec.startTime : null,
		planDate: isPlanDate(rec.planDate) ? rec.planDate : null,
		endDestination: pickPlace(rec.endDestination) ?? null
	};

	const shareId = randomUUID();

	try {
		await insertPlan(shareId, data);
	} catch (e) {
		console.error('[savePlan] DB insert failed:', e);
		error(500, 'プランの保存に失敗しました');
	}

	return { shareId };
}
