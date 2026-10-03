import { describe, expect, it } from 'vite-plus/test';
import { getTableName, getTableColumns, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { plans } from './schema';

// issue #62/#116: スキーマ定義のリグレッションテスト。
// アプリ固有テーブルは plans のみ（ユーザーはSupabase Auth = auth.users が管理する）。

/** テーブルのカラム名（DB上の実名）を集合で返す。 */
function columnNames(table: Parameters<typeof getTableColumns>[0]) {
	return new Set(Object.values(getTableColumns(table)).map((c) => c.name));
}

/** テーブルのカラムをDB上の実名で引く。 */
function column(table: Parameters<typeof getTableColumns>[0], name: string) {
	return Object.values(getTableColumns(table)).find((c) => c.name === name);
}

describe('エクスポートされるテーブル', () => {
	it('plans 以外のテーブルをエクスポートしない（旧認証用の4テーブルは削除済み）', () => {
		const tables = Object.values(schema)
			.filter((v) => is(v, PgTable))
			.map((t) => getTableName(t));
		expect(tables).toEqual(['plans']);
	});

	it('リレーション定義などテーブル以外もエクスポートしない', () => {
		expect(Object.keys(schema)).toEqual(['plans']);
	});
});

describe('plans', () => {
	it('共有URL発行に必要なカラムを持つ', () => {
		expect(columnNames(plans)).toEqual(new Set(['id', 'share_id', 'data', 'created_at']));
	});

	it('share_idを一意にする', () => {
		expect(column(plans, 'share_id')?.isUnique).toBe(true);
	});

	// issue #115: 不正形式の入力でDBの型エラー(500)を起こさないため、UUID型ではなく文字列型にする
	it('share_idは文字列型、dataはjsonbにする', () => {
		expect(column(plans, 'share_id')?.columnType).toBe('PgText');
		expect(column(plans, 'data')?.columnType).toBe('PgJsonb');
	});

	it('share_idとdataを必須にする', () => {
		expect(column(plans, 'share_id')?.notNull).toBe(true);
		expect(column(plans, 'data')?.notNull).toBe(true);
	});
});

// issue #115: SupabaseのData APIから公開キーで読めないよう、RLSを有効にしポリシーは作らない。
describe('RLS（行レベルセキュリティ）', () => {
	it('plans はRLSが有効でポリシーが無い', () => {
		const config = getTableConfig(plans);
		expect(config.enableRLS).toBe(true);
		expect(config.policies).toHaveLength(0);
	});
});
