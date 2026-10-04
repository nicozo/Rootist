import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { checkMigrations, createdPublicTables, type MigrationFile } from './migration-rls';

// issue #128: supabase/migrations の RLS 静的検査（旧ORM時代のスキーマ定義側のRLS指定とそのテストの置き換え）。
// 検査ロジックの限界は migration-rls.ts 冒頭のコメントを参照。

const MIGRATIONS_DIR = new URL('../../../supabase/migrations/', import.meta.url);

function loadRealMigrations(): MigrationFile[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.map((name) => ({ name, sql: readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8') }));
}

const f = (name: string, sql: string): MigrationFile => ({ name, sql });

describe('実際の supabase/migrations', () => {
	const files = loadRealMigrations();

	it('1件以上のファイルを読み、plans を検出している（0件で素通りしない）', () => {
		expect(files.length).toBeGreaterThanOrEqual(1);
		expect(createdPublicTables(files)).toContain('plans');
	});

	it('public の全テーブルでRLSが有効で、ポリシーが1件も無い', () => {
		expect(checkMigrations(files)).toEqual([]);
	});
});

describe('RLS検査ロジック（フィクスチャ）', () => {
	it('正常系: 表を作り同じファイルでRLSを有効化していれば合格', () => {
		const sql = 'create table public.a (id int);\nalter table public.a enable row level security;';
		expect(checkMigrations([f('1.sql', sql)])).toEqual([]);
	});

	it('RLS行が無いと、表名を含むメッセージで失敗する（常にPASSする検査ではない）', () => {
		const violations = checkMigrations([f('1.sql', 'create table public.secret_notes (id int);')]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('secret_notes');
	});

	it('create policy があると失敗する', () => {
		const sql = `create table public.a (id int);
alter table public.a enable row level security;
create policy "read all" on public.a for select using (true);`;
		const violations = checkMigrations([f('1.sql', sql)]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('create policy');
	});

	it('別ファイルのRLS有効化を認識する（複数ファイルにまたがる）', () => {
		const files = [
			f('1_create.sql', 'create table public.a (id int);'),
			f('2_rls.sql', 'alter table public.a enable row level security;')
		];
		expect(checkMigrations(files)).toEqual([]);
	});

	it('ファイル名順に処理する（渡された順序に依存しない）', () => {
		const files = [
			f('2_rls.sql', 'alter table public.a enable row level security;'),
			f('1_create.sql', 'create table public.a (id int);')
		];
		expect(checkMigrations(files)).toEqual([]);
	});

	it('大文字・if not exists・public. 省略を認識する', () => {
		const sql = `CREATE TABLE IF NOT EXISTS plans (id int);
ALTER TABLE Plans ENABLE ROW LEVEL SECURITY;`;
		expect(checkMigrations([f('1.sql', sql)])).toEqual([]);
		expect(createdPublicTables([f('1.sql', sql)])).toEqual(['plans']);
		expect(
			checkMigrations([f('1.sql', 'CREATE TABLE IF NOT EXISTS plans (id int);')])
		).toHaveLength(1);
	});

	it('"public"."x" のクォート付き識別子に対応する（挙動を固定）', () => {
		const ok = `create table "public"."q" (id int);
alter table "public"."q" enable row level security;`;
		expect(checkMigrations([f('1.sql', ok)])).toEqual([]);
		const ng = checkMigrations([f('1.sql', 'create table "public"."q" (id int);')]);
		expect(ng).toHaveLength(1);
		expect(ng[0]).toContain('public.q');
	});

	it('表Aを作りRLSを表Bにだけ有効化した場合、Aの名前を含むメッセージで失敗する', () => {
		const sql = `create table public.table_a (id int);
create table public.table_b (id int);
alter table public.table_b enable row level security;`;
		const violations = checkMigrations([f('1.sql', sql)]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('table_a');
		expect(violations[0]).not.toContain('table_b');
	});

	it('後続のマイグレーションで disable row level security すると失敗する', () => {
		const files = [
			f(
				'1.sql',
				'create table public.a (id int);\nalter table public.a enable row level security;'
			),
			f('2.sql', 'alter table public.a disable row level security;')
		];
		const violations = checkMigrations(files);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public.a');
	});

	it('public 以外のスキーマの表は対象外（RLSが無くても合格）', () => {
		expect(checkMigrations([f('1.sql', 'create table private.x (id int);')])).toEqual([]);
		expect(createdPublicTables([f('1.sql', 'create table private.x (id int);')])).toEqual([]);
	});

	it('drop table した表は検査対象から外れる', () => {
		const files = [
			f('1.sql', 'create table public.a (id int);'),
			f('2.sql', 'drop table public.a;')
		];
		expect(checkMigrations(files)).toEqual([]);
	});

	it('コメント内の enable row level security / create policy は無視する', () => {
		const sql = `create table public.a (id int);
-- alter table public.a enable row level security;
/* create policy "x" on public.a; */`;
		const violations = checkMigrations([f('1.sql', sql)]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public.a');
	});
});

// 旧スキーマ定義のテストが守っていた plans の形（4列・share_id は text not null unique・data は jsonb not null）を、
// ベースラインSQLの静的検査として維持する。
describe('ベースラインSQLの plans の形', () => {
	const baseline = loadRealMigrations().find((m) => m.name.includes('baseline_plans'));
	const sql = (baseline?.sql ?? '')
		.replace(/--[^\n]*/g, '')
		.replace(/\s+/g, ' ')
		.toLowerCase();

	it('ベースラインのファイルが存在する', () => {
		expect(baseline).toBeDefined();
	});

	it('冪等に書かれている（create table if not exists）', () => {
		expect(sql).toContain('create table if not exists public.plans');
	});

	it('4列を持つ（id / share_id / data / created_at）', () => {
		expect(sql).toContain('id integer generated always as identity');
		expect(sql).toContain('share_id text not null');
		expect(sql).toContain('data jsonb not null');
		expect(sql).toContain('created_at timestamp with time zone not null default now()');
	});

	it('主キーと share_id の一意制約に名前を明示する（plans_share_id_unique）', () => {
		expect(sql).toContain('constraint plans_pkey primary key (id)');
		expect(sql).toContain('constraint plans_share_id_unique unique (share_id)');
	});

	it('RLSを有効にしポリシーは作らない', () => {
		expect(sql).toContain('alter table public.plans enable row level security');
		expect(sql).not.toContain('create policy');
	});
});
