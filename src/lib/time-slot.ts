/**
 * 行き先ごとの時間帯（朝・昼・晩）の値の定義（issue #159）。
 *
 * `#lib/stores/route.js` の型・`/plan` の入力・ルート生成のスキーマ（`#lib/schemas/route.js`）が
 * 同じ3値を参照するための唯一の定義。値を増減するときはここだけを直す。
 */

export const TIME_SLOTS = ['morning', 'noon', 'night'] as const;

export type TimeSlot = (typeof TIME_SLOTS)[number];
