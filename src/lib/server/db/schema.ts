import { mysqlTable, serial, bigint, varchar, json, timestamp } from 'drizzle-orm/mysql-core';

export const plans = mysqlTable('plans', {
	id: serial('id').primaryKey(),
	shareId: varchar('share_id', { length: 36 }).notNull().unique(),
	data: json('data').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

// issue #3: ユーザー登録・ログイン。
// 将来拡張（未実装。issue #42/#44/#45/#46/#47で列/テーブル追加のみで対応予定）:
// - #45: users.emailVerified 列
// - #42: oauth_accounts テーブル ＋ passwordHash の nullable化
// - #47: plans.userId 列
export const users = mysqlTable('users', {
	id: serial('id').primaryKey(),
	// ログインID。小文字正規化済みの値のみ保存する（src/lib/server/auth/validation.ts）
	email: varchar('email', { length: 255 }).notNull().unique(),
	// argon2idハッシュ文字列（$argon2id$...形式）。平文パスワードは一切保存しない
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

export const sessions = mysqlTable('sessions', {
	// セッショントークンのSHA-256ハッシュ（hex 64文字）。トークン生値は保存しない
	id: varchar('id', { length: 64 }).primaryKey(),
	userId: bigint('user_id', { mode: 'number', unsigned: true })
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at').notNull()
});
