import { writable } from 'svelte/store';

export interface RouteDestination {
	order: number;
	name: string;
	displayAddress: string;
	arrivalTime: string;
	departureTime: string;
	description: string;
	travelTimeFromPrevious: string | null;
	transitRoute?: string | null;
	timeSlot?: 'morning' | 'noon' | 'night' | null;
	stayMinutes?: number | null;
	/** ユーザーが指定した訪問時刻 "HH:MM"（未指定は null）。issue #70 */
	arriveAt?: string | null;
}

export interface RouteResult {
	origin?: { name: string; displayAddress: string };
	transportMode?: string | null;
	startTime?: string | null;
	endDestination?: { name: string; displayAddress: string } | null;
	destinations: RouteDestination[];
	summary: string;
}

export const routeResult = writable<RouteResult | null>(null);

/**
 * 「もう一度計画する」で /plan に戻った際に入力欄へ復元する下書き（issue #64）。
 * routeResult とは独立した型として持つ（生成結果ではなく「復元する入力」を表すため）。
 * 保存は /plan/result の「もう一度計画する」ボタン押下時のみ、消費は /plan 初期化時の1回のみ。
 */
export interface PlanDraft {
	origin: { name: string; displayAddress: string } | null;
	transportMode: 'transit' | 'car' | 'walking' | '';
	startTime: string;
	endDestination: { name: string; displayAddress: string } | null;
	locations: {
		address: string;
		displayAddress?: string;
		timeSlot: 'morning' | 'noon' | 'night' | '';
		stayMinutes: number | '';
		arriveAt: string;
	}[];
}

export const planDraft = writable<PlanDraft | null>(null);
