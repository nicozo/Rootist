import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// issue #115: Supabaseの Session pooler（ポート5432）に接続する。Transaction pooler（6543）は
// プリペアドステートメントを使えないため使わない（docs/supabase-setup.md）。
// postgres.jsは最初のクエリ時に接続する（import時には接続しない）。
// Session poolerはクライアント数の上限が小さいため、接続数を絞りアイドル接続を早めに解放する
// （開発サーバーのHMRでモジュールが再評価されても接続が積み上がらないようにする）。
export const POOL_OPTIONS = {
	max: 3,
	idle_timeout: 20,
	connect_timeout: 10
} as const;

const client = postgres(env.DATABASE_URL, POOL_OPTIONS);

export const db = drizzle(client, { schema });
