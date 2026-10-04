import { error } from '@sveltejs/kit';
import { findPlanByShareId } from '$lib/server/db/plans';
import type { PageServerLoad } from './$types';

// issue #115: shareIdはPOST /api/plansがrandomUUID()で発行したUUID。形式が違う入力はDBを呼ばずに404にする。
// Postgresのtext型はNUL文字(%00)を受け付けずエラー(500)になるため、検索前に弾く必要がある。
// DB接続エラー等は握りつぶさず、そのまま500にする（障害を「見つからない」に見せない）。
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params }) => {
	if (!UUID_PATTERN.test(params.shareId)) {
		error(404, '共有されたプランが見つかりません');
	}
	// 保存時は小文字のUUID。旧DB(大小無視の照合順序)では大文字でも一致していたため、小文字に揃えて検索する
	const shareId = params.shareId.toLowerCase();
	const result = await findPlanByShareId(shareId);

	if (!result) {
		error(404, '共有されたプランが見つかりません');
	}

	return { result };
};
