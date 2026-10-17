import * as v from 'valibot';
import { isJsonValue } from '#lib/json-value.js';

const nonEmptyString = v.pipe(v.string(), v.minLength(1));

// 既知フィールド以外は未知キーとして保持する（looseObject）。保存サイズの判定を「正規化前の引数」で行い、
// 判定後に本体で既知キーへ絞るため、境界では捨てない（issue #159 D4）。
const destination = v.looseObject({
	order: v.pipe(v.number(), v.finite(), v.gtValue(0)),
	name: nonEmptyString,
	displayAddress: nonEmptyString,
	arrivalTime: nonEmptyString,
	departureTime: nonEmptyString
});

/**
 * プラン保存の引数（生成結果 RouteResult そのもの）。
 * - 必須 4 項目と order 以外は型を検査しない（モデル出力由来の値がそのまま来る。正規化は本体）
 * - JSON で表せない値（Date・Map・BigInt・NaN・File など）は境界で拒否する（移行前の受理集合と同じにする）
 * - 保存サイズと order の重複は業務ルールとして本体で判定する。スキーマ内に置くと
 *   メッセージが既定の 'Bad Request' に置き換わり、文言を維持できないため
 */
export const savePlanSchema = v.pipe(
	v.looseObject({
		destinations: v.pipe(v.array(destination), v.minLength(1))
	}),
	v.check((input) => isJsonValue(input))
);

export type SavePlanInput = v.InferOutput<typeof savePlanSchema>;
