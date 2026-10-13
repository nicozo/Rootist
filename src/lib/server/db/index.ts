import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';

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

// issue #128: ORMは使わず postgres.js で SQL を直接書く。クエリは必ずタグ付きテンプレートで
// パラメータ化する（文字列連結・sql.unsafe は使わない）。スキーマの正は supabase/migrations。
export const sql = postgres(DATABASE_URL, POOL_OPTIONS);
