import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// issue #115: 旧DBからSupabase(Postgres)へ移行。スキーマはPostgres用に新規に作り直している。
// issue #116: アプリ固有テーブルは plans のみ。ユーザーはSupabase Auth（auth.users）が管理し、
// public にはユーザー用テーブルを置かない（auth スキーマはマイグレーションから触れない）。
// plans は RLS を有効化しポリシーは作らない（SupabaseのData APIからpublishable keyで
// 読めないようにする。アプリはDB所有者ロールで直結するため影響を受けない）。
// テーブルを追加する時も必ず .enableRLS() を付けること（docs/supabase-setup.md）。
const tz = { withTimezone: true } as const;

export const plans = pgTable('plans', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	// shareIdはUUID文字列。UUID型にしないのは、不正形式の入力でDBの型エラーを起こさないため
	shareId: text('share_id').notNull().unique(),
	data: jsonb('data').notNull(),
	createdAt: timestamp('created_at', tz).notNull().defaultNow()
}).enableRLS();
