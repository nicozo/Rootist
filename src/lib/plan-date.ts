/**
 * 旅行プラン全体の日付（"YYYY-MM-DD"）に関する共有ロジック（issue #73）。
 *
 * `date-picker.svelte` の入力・`/api/route` のホワイトリスト検証とエコーバック・
 * `/api/plans` の保存・`plan-timeline.svelte` の表示の4箇所で同じ形式判定と
 * 表示整形を使い回すための共通モジュール。
 *
 * タイムゾーン方針: `planDate` はタイムゾーンを持たないカレンダー日付として扱う。
 * 実行環境のタイムゾーンに影響されるローカル時刻系の読み出しAPIは一切使わず、
 * `Date.UTC` で構築し `getUTC` 系のメソッドでのみ読み出す。サーバー側で
 * 「現在時刻」を起点に既定値を補完する処理もここには置かない。
 * import は一切行わない（純関数のみ）。
 */

/** "YYYY-MM-DD"（ゼロ埋め必須）の形式のみを許容する。 */
const PLAN_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 曜日（UTCの getUTCDay() の返り値 0=日〜6=土 に対応）。 */
const WEEKDAY_KANJI = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * "YYYY-MM-DD" 形式かつ実在するカレンダー日付かどうかを判定する。
 * stayMinutes のプリセット判定・visitTime の形式判定と同じく
 * 「ホワイトリスト外・形式外はプロンプト汚染・不正表示防止のため無視する」方針に使う。
 */
export function isPlanDate(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const match = PLAN_DATE_PATTERN.exec(value);
	if (!match) return false;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);

	const utcMs = Date.UTC(year, month - 1, day);
	const rebuilt = new Date(Date.UTC(year, month - 1, day));

	// Date.UTC は月・日のオーバーフローを吸収して繰り上げてしまうため、
	// 構築後の年・月・日（UTC）が入力と一致するかで実在日を確認する。
	return (
		Number.isFinite(utcMs) &&
		rebuilt.getUTCFullYear() === year &&
		rebuilt.getUTCMonth() === month - 1 &&
		rebuilt.getUTCDate() === day
	);
}

/**
 * "2026-09-05" → "2026年9月5日（土）" に変換する。
 * 呼び出し前に必ず `isPlanDate` でガードすること（本関数は形式チェックをしない）。
 */
export function formatPlanDate(date: string): string {
	const match = PLAN_DATE_PATTERN.exec(date);
	if (!match) return '';

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);

	const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

	return `${year}年${month}月${day}日（${WEEKDAY_KANJI[dow]}）`;
}
