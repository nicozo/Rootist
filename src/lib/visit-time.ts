/**
 * 行き先ごとの訪問時刻（"HH:MM"）に関する共有ロジック（issue #70）。
 *
 * `/plan` の入力・`/api/route` のプロンプト生成とホワイトリスト検証・
 * `plan-timeline.svelte` のバッジ表示で同じ時刻フォーマット判定を使い回すための共通モジュール。
 */

/** 24時間表記の "HH:MM"（00:00〜23:59）のみを許容する。 */
const VISIT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * 厳密な "HH:MM" 形式かどうかを判定する。
 * stayMinutes のプリセット判定と同じく「形式外はプロンプト汚染防止のため無視する」方針に使う。
 */
export function isVisitTime(value: unknown): value is string {
	return typeof value === 'string' && VISIT_TIME_PATTERN.test(value);
}

/**
 * "H:MM" / "HH:MM" 形式の時刻文字列を0時からの分数に変換する。解釈できなければnull。
 * 入力検証（isVisitTime）より緩く、モデル出力の時刻を読み取る用途にも使う。
 */
export function parseTimeToMinutes(time: unknown): number | null {
	if (typeof time !== 'string') return null;
	const match = /^(\d{1,2}):(\d{2})$/.exec(time);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}
