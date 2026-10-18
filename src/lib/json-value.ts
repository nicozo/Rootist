/**
 * 「JSON で表せる値」だけを受理する判定（issue #159）。
 *
 * remote functions の引数は devalue で運ばれるため、JSON では運べなかった値
 * （Date・Map・Set・BigInt・NaN・Infinity・File・循環参照など）も届きうる。
 * 移行前（JSON 本文）の受理集合と同じにするため、プラン保存の境界で弾く。
 * undefined はキーが無いのと同じ扱いで受理する（JSON.stringify がキーごと落とすため）。
 */

/** 循環参照や極端に深い入れ子で再帰が溢れないための上限。 */
const MAX_DEPTH = 64;

function isPlainObject(value: object): boolean {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

export function isJsonValue(value: unknown, depth = 0): boolean {
	if (depth > MAX_DEPTH) return false;
	if (value === null || value === undefined) return true;
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return true;
		case 'number':
			return Number.isFinite(value);
		case 'object':
			if (Array.isArray(value)) return value.every((v) => isJsonValue(v, depth + 1));
			if (!isPlainObject(value)) return false;
			return Object.values(value).every((v) => isJsonValue(v, depth + 1));
		default:
			return false;
	}
}
