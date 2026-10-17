import { command } from '$app/server';
import { placesSearchSchema } from '#lib/schemas/places.js';
import { autocompletePlaces } from '#lib/server/places-autocomplete.js';

// 場所検索。課金のある外部 API を叩くため、GET の query ではなく POST の command にする
// （検索語を URL に残さない・クロスサイト検査の対象にする。issue #159 D1）。
// このファイルは「スキーマ + 本体の呼び出し」だけの薄い層にする。ロジックは #lib/server に置く。
export const searchPlaces = command(placesSearchSchema, autocompletePlaces);
