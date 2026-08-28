import { relations } from 'drizzle-orm';
import {
	mysqlTable,
	serial,
	varchar,
	json,
	timestamp,
	text,
	boolean,
	index,
	uniqueIndex
} from 'drizzle-orm/mysql-core';

export const plans = mysqlTable('plans', {
	id: serial('id').primaryKey(),
	shareId: varchar('share_id', { length: 36 }).notNull().unique(),
	data: json('data').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

// issue #49: issue #3の自前実装（users/sessions、argon2id、Luciaパターン）をBetter Auth標準
// スキーマへ移行。以下4テーブルは `pnpm dlx auth@latest generate` の出力をそのまま採用したもので、
// カラム名・型は手動設計しない（Better Authの規約が正）。既存ユーザーデータは破棄済み。
export const user = mysqlTable('user', {
	id: varchar('id', { length: 36 }).primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { fsp: 3 })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const session = mysqlTable(
	'session',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
		token: varchar('token', { length: 255 }).notNull().unique(),
		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { fsp: 3 })
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: varchar('user_id', { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [index('session_userId_idx').on(table.userId)]
);

export const account = mysqlTable(
	'account',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		issuer: varchar('issuer', { length: 191 }).notNull(),
		accountId: varchar('account_id', { length: 191 }).notNull(),
		providerId: text('provider_id').notNull(),
		userId: varchar('user_id', { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { fsp: 3 }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { fsp: 3 }),
		scope: text('scope'),
		// email/password認証のパスワードハッシュ（scrypt）。平文パスワードは一切保存しない
		password: text('password'),
		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { fsp: 3 })
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
		index('account_userId_idx').on(table.userId)
	]
);

export const verification = mysqlTable(
	'verification',
	{
		id: varchar('id', { length: 36 }).primaryKey(),
		identifier: varchar('identifier', { length: 255 }).notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
		createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { fsp: 3 })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

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
