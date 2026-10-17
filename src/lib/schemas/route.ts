import * as v from 'valibot';
import { TIME_SLOTS } from '#lib/time-slot.js';
import { STAY_MINUTES_PRESETS } from '#lib/stay-minutes.js';
import { isVisitTime } from '#lib/visit-time.js';
import { isPlanDate } from '#lib/plan-date.js';

/**
 * ホワイトリスト外の値を拒否せず「未指定」に落とす（プロンプト汚染防止のため無視する方針。issue #62・#66・#70・#73）。
 * 入力型はホワイトリストの値に絞られ、実行時に不正値が来ても 400 にせず undefined になる。
 */
const ignoreWhenInvalid = <const TSchema extends v.GenericSchema>(schema: TSchema) =>
	v.fallback(v.optional(schema), undefined);

const place = v.object({ name: v.string(), displayAddress: v.string() });

const location = v.object({
	name: v.string(),
	displayAddress: v.string(),
	timeSlot: ignoreWhenInvalid(v.picklist(TIME_SLOTS)),
	stayMinutes: ignoreWhenInvalid(v.picklist(STAY_MINUTES_PRESETS)),
	arriveAt: ignoreWhenInvalid(
		v.pipe(
			v.string(),
			v.check((s: string) => isVisitTime(s))
		)
	)
});

/**
 * ルート生成の引数。目的地が 2 件未満（未指定を含む）は業務ルールとして本体で判定する
 * （移行前と同じ文言で 400 を返すため、境界では必須にしない）。
 * 旧 API は null を未指定として扱っていた（locations・transportMode・startTime・origin・endDestination）ため nullish にする。
 */
export const routeGenerationSchema = v.optional(
	v.object({
		locations: v.nullish(v.array(location)),
		origin: v.nullish(place),
		transportMode: v.nullish(v.string()),
		startTime: v.nullish(v.string()),
		endDestination: v.nullish(place),
		planDate: ignoreWhenInvalid(
			v.pipe(
				v.string(),
				v.check((s: string) => isPlanDate(s))
			)
		)
	})
);

export type RouteGenerationInput = v.InferOutput<typeof routeGenerationSchema>;
