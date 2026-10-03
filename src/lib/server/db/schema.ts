import { relations } from 'drizzle-orm';
import {
	pgTable,
	integer,
	jsonb,
	timestamp,
	text,
	boolean,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';

// issue #115: MySQLからSupabase(Postgres)へ移行。スキーマはPostgres用に新規に作り直している。
// 5テーブルすべてRLSを有効化しポリシーは作らない（SupabaseのData APIからpublishable keyで
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

// issue #49/#115: Better Auth標準スキーマ（better-auth 1.7.2のgetAuthTablesの定義に合わせる。
// カラム名・型は手動設計しない）。#116でSupabase Authへ置き換える際に4テーブルごと削除する暫定移植。
export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at', tz).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', tz)
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
}).enableRLS();

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at', tz).notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at', tz).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', tz)
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [index('session_userId_idx').on(table.userId)]
).enableRLS();

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		// issue #42: Better Authランタイムが必須とする列（CLIの出力に無くても消さない）
		issuer: text('issuer').notNull(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', tz),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', tz),
		scope: text('scope'),
		// email/password認証のパスワードハッシュ（scrypt）。平文パスワードは一切保存しない
		password: text('password'),
		createdAt: timestamp('created_at', tz).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', tz)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
		index('account_userId_idx').on(table.userId)
	]
).enableRLS();

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', tz).notNull(),
		createdAt: timestamp('created_at', tz).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', tz)
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
).enableRLS();

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	})
}));
