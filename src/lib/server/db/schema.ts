import { mysqlTable, serial, int, varchar, json, timestamp } from 'drizzle-orm/mysql-core';

export const user = mysqlTable('user', { id: serial('id').primaryKey(), age: int('age') });

export const plans = mysqlTable('plans', {
	id: serial('id').primaryKey(),
	shareId: varchar('share_id', { length: 36 }).notNull().unique(),
	data: json('data').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow()
});
