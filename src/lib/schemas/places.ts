import * as v from 'valibot';

/**
 * 場所検索の引数。2 文字未満・未指定は「候補なし」として本体で扱うため、境界では 400 にしない
 * （移行前の `{ suggestions: [] }` を維持する）。null も未指定と同じ扱い（旧 API は `!query` で判定していた）。型が違う値（数値など）だけ境界で拒否する。
 */
export const placesSearchSchema = v.optional(v.object({ query: v.nullish(v.string()) }));

export type PlacesSearchInput = v.InferOutput<typeof placesSearchSchema>;
