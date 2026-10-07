import { writable } from 'svelte/store';

/** 移動手段の選択肢 */
export const TRANSPORT_MODES = ['transit', 'car', 'walking'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** 訪問時間帯と表示名 */
export const TIME_SLOT_LABELS = { morning: '朝', noon: '昼', night: '晩' } as const;
export type TimeSlot = keyof typeof TIME_SLOT_LABELS;

/** 緯度経度（度）。訪問順序の計算に使う（issue #149） */
export interface LatLng {
	lat: number;
	lng: number;
}

/** 出発地・終点などの地点。location は Places の詳細取得で得た座標（旧データには無い） */
export interface Place {
	name: string;
	displayAddress: string;
	location?: LatLng;
}

export interface RouteDestination {
	order: number;
	name: string;
	displayAddress: string;
	arrivalTime: string;
	departureTime: string;
	description: string;
	travelTimeFromPrevious: string | null;
	transitRoute?: string | null;
	timeSlot?: TimeSlot | null;
	stayMinutes?: number | null;
	/** ユーザーが指定した訪問時刻 "HH:MM"（未指定は null）。issue #70 */
	arriveAt?: string | null;
	/** 「もう一度計画する」で座標を引き継ぐための位置（保存・共有データには含めない）。issue #149 */
	location?: LatLng;
}

export interface RouteResult {
	origin?: Place;
	transportMode?: string | null;
	startTime?: string | null;
	endDestination?: Place | null;
	/** プラン全体の日付 "YYYY-MM-DD"（未指定・既存データはnull/キー欠落）。issue #73 */
	planDate?: string | null;
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
	origin: Place | null;
	transportMode: TransportMode | '';
	startTime: string;
	endDestination: Place | null;
	/** プラン全体の日付 "YYYY-MM-DD"（未指定は空文字）。issue #73 */
	planDate: string;
	locations: {
		address: string;
		displayAddress?: string;
		timeSlot: TimeSlot | '';
		stayMinutes: number | '';
		arriveAt: string;
		location?: LatLng;
	}[];
}

export const planDraft = writable<PlanDraft | null>(null);
