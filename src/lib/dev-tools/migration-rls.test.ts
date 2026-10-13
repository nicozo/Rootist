import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import {
	checkMigrations,
	checkPrivileges,
	createdPublicTables,
	type MigrationFile
} from './migration-rls';

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

// issue #118: 権限の取り消し検査（checkPrivileges）。RLS の検査（checkMigrations）とは別関数で、上のテストは変えない。
describe('実際の supabase/migrations の権限', () => {
	const files = loadRealMigrations();

	it('public の全テーブルで Data API 用ロールの権限が取り消されており、grant が1件も無い', () => {
		expect(checkPrivileges(files)).toEqual([]);
	});

	it('取り消しのマイグレーションを除くと失敗する（plans を検出して空振りしていない）', () => {
		const withoutRevoke = files.filter((m) => !m.name.includes('revoke_plans'));
		expect(withoutRevoke.length).toBe(files.length - 1);
		const violations = checkPrivileges(withoutRevoke);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public.plans');
	});
});

describe('権限の検査ロジック（フィクスチャ）', () => {
	const create = 'create table public.a (id int);';
	const revokeAll = 'revoke all on table public.a from anon, authenticated, service_role, public;';

	it('合格: 4ロールを1文で取り消している', () => {
		expect(checkPrivileges([f('1.sql', `${create}\n${revokeAll}`)])).toEqual([]);
	});

	it('合格: 複数の文・別ファイルに分けて4ロールを取り消してもよい（all privileges / table 省略 / 大文字も認識）', () => {
		const files = [
			f('1.sql', create),
			f('2.sql', 'REVOKE ALL PRIVILEGES ON public.a FROM anon, authenticated;'),
			f(
				'3.sql',
				'revoke all on table "public"."a" from service_role;\nrevoke all on a from public;'
			)
		];
		expect(checkPrivileges(files)).toEqual([]);
	});

	it('合格: コメント内の revoke / grant は無視する（コメントの grant で失敗しない。コメントの revoke で通らない）', () => {
		const ok = `${create}\n${revokeAll}\n-- grant select on public.a to anon;`;
		expect(checkPrivileges([f('1.sql', ok)])).toEqual([]);
		const ng = checkPrivileges([f('1.sql', `${create}\n-- ${revokeAll}`)]);
		expect(ng).toHaveLength(1);
		expect(ng[0]).toContain('public.a');
	});

	it('取り消しが無いと、表名とロール名を含むメッセージで失敗する', () => {
		const violations = checkPrivileges([f('1.sql', create)]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public.a');
		expect(violations[0]).toContain('anon, authenticated, service_role, public');
	});

	it('一部のロールだけの取り消しは失敗する（欠けたロールを示す）', () => {
		const violations = checkPrivileges([
			f('1.sql', `${create}\nrevoke all on table public.a from anon;`)
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public.a');
		expect(violations[0]).toContain('authenticated, service_role, public');
		expect(violations[0].split('。')[0]).not.toContain('anon');
	});

	it('一部の権限だけの取り消し（revoke select）は失敗する', () => {
		const violations = checkPrivileges([
			f(
				'1.sql',
				`${create}\nrevoke select on table public.a from anon, authenticated, service_role, public;`
			)
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public.a');
	});

	it('取り消した後に別ファイルで grant し直すと失敗する', () => {
		const violations = checkPrivileges([
			f('1.sql', `${create}\n${revokeAll}`),
			f('2.sql', 'grant select on table public.a to anon;')
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('2.sql');
		expect(violations[0]).toContain('anon');
	});

	it('drop table して再作成した表は、再作成より後の取り消しが必要（前の取り消しは引き継がない）', () => {
		const files = [
			f('1.sql', `${create}\n${revokeAll}`),
			f('2.sql', 'drop table public.a;\ncreate table public.a (id int);')
		];
		const violations = checkPrivileges(files);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public.a');
		expect(checkPrivileges([...files, f('3.sql', revokeAll)])).toEqual([]);
	});

	it('create table if not exists の再実行は、既存の取り消しの記録を消さない', () => {
		const files = [
			f('1.sql', `${create}\n${revokeAll}`),
			f('2.sql', 'create table if not exists public.a (id int);')
		];
		expect(checkPrivileges(files)).toEqual([]);
	});

	it('grant ... on all tables in schema public to anon は失敗する', () => {
		const violations = checkPrivileges([
			f('1.sql', 'grant select on all tables in schema public to anon;')
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('anon');
	});

	it('alter default privileges ... grant ... to anon は失敗する', () => {
		const violations = checkPrivileges([
			f('1.sql', 'alter default privileges in schema public grant select on tables to anon;')
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('anon');
	});

	it('grant ... to public は失敗する', () => {
		const violations = checkPrivileges([f('1.sql', 'grant select on public.a to public;')]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('public');
	});

	it('シーケンスへの grant は失敗する', () => {
		const violations = checkPrivileges([
			f('1.sql', 'grant usage on sequence public.a_id_seq to authenticated with grant option;')
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain('authenticated');
	});

	it('Data API 用ロール以外への grant は対象外', () => {
		expect(checkPrivileges([f('1.sql', 'grant select on public.a to reporting_role;')])).toEqual(
			[]
		);
	});

	it('public 以外のスキーマの表は対象外', () => {
		expect(checkPrivileges([f('1.sql', 'create table private.x (id int);')])).toEqual([]);
	});
});
