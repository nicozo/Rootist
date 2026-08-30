/**
 * 行き先ごとの滞在時間（分）に関する共有ロジック（issue #66）。
 *
 * `/plan` の Select プリセット表示・`/api/route` のプロンプト生成とホワイトリスト検証・
 * `plan-timeline.svelte` のバッジ表示の3箇所で同じプリセット定義と日本語表記ルールを
 * 使い回すための共通モジュール。
 */

/** UIで選択できるプリセット（分）。短時間ほど細かく、長時間ほど粗い刻みにしている。 */
export const STAY_MINUTES_PRESETS = [30, 60, 90, 120, 180, 240, 360] as const;

export type StayMinutesPreset = (typeof STAY_MINUTES_PRESETS)[number];

const PRESET_SET = new Set<number>(STAY_MINUTES_PRESETS);

/**
 * プリセットのホワイトリストに含まれる値かどうかを判定する。
 * timeSlot と同じ「ホワイトリスト以外はプロンプト汚染防止のため無視する」方針に使う。
 */
export function isStayMinutesPreset(value: unknown): value is StayMinutesPreset {
	return typeof value === 'number' && PRESET_SET.has(value);
}

/** 分数を「1時間30分」のような日本語表記に変換する（30分刻み・60分刻み混在に対応）。 */
export function formatStayMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours === 0) return `${mins}分`;
	if (mins === 0) return `${hours}時間`;
	return `${hours}時間${mins}分`;
}
