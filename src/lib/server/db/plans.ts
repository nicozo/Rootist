import type { JSONValue } from 'postgres';
import type { RouteResult } from '$lib/stores/route';
import { sql } from './index';

// issue #128: plans テーブルへのアクセスをこのファイルに集約する（ルートは SQL を知らない）。
// スキーマの正は supabase/migrations/*_baseline_plans.sql。

/** プランを保存する。data は JSON 文字列ではなくオブジェクトとして渡し、jsonb の object として保存する。 */
export async function insertPlan(shareId: string, data: RouteResult): Promise<void> {
	await sql`insert into plans (share_id, data) values (${shareId}, ${sql.json(data as unknown as JSONValue)})`;
}

/**
 * shareId で1件だけ取得する。無ければ null。
 * 過去に jsonb が JSON 文字列のスカラーとして保存された行があっても、同じ RouteResult として返す。
 */
export async function findPlanByShareId(shareId: string): Promise<RouteResult | null> {
	const rows = await sql<{ data: unknown }[]>`
		select data from plans where share_id = ${shareId} limit 1
	`;
	const row = rows[0];
	if (!row) return null;
	const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
	return data as RouteResult;
}
