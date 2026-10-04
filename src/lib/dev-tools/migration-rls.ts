// issue #128: supabase/migrations/*.sql の静的検査（RLS の有効化漏れを防ぐ）。
// 旧ORMのスキーマ定義側で行っていたRLS指定とそのリグレッションテストの置き換え。
// 完全な SQL パーサではない。限界（誤検知・見逃し）:
// - ';' でステートメントを分割するため、$$ ... $$ 内の ';'（関数本体）を含む SQL は正確に扱えない
// - コメント（-- と /* */）は除去して解析するが、文字列リテラル内のコメント記号は区別しない
// - 識別子は小文字化して比較する（"Plans" のような大文字クォート識別子は plans と同一視する）
// - "public"."x" のようなクォート付き識別子と public. 省略（public 扱い）には対応する
// - public 以外のスキーマの表は対象外（auth など Supabase 管理側のスキーマは触らない方針）
// - ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY と DROP TABLE だけを状態遷移として扱う
// このファイルは SvelteKit の仮想モジュールを import しない（単体テストと同じ検査を Node から実行できる）。

export type MigrationFile = { name: string; sql: string };

const IDENT = String.raw`"?[a-z_][a-z0-9_]*"?`;
// [schema.]table（schema は省略可）
const QUALIFIED = String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})`;
const CREATE_TABLE = new RegExp(
	String.raw`^create\s+(?:(?:global\s+|local\s+)?(?:temporary|temp)\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${QUALIFIED}`
);
const ALTER_RLS = new RegExp(
	String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${QUALIFIED}\s+(enable|disable)\s+row\s+level\s+security\b`
);
const DROP_TABLE = new RegExp(String.raw`^drop\s+table\s+(?:if\s+exists\s+)?${QUALIFIED}`);
const CREATE_POLICY = /^create\s+policy\s+("?[^\s"]+"?)/;

function unquote(ident: string): string {
	return ident.replace(/"/g, '');
}

/** コメントを除去し、ステートメント単位（小文字・空白1つ）に分割する。 */
export function splitStatements(sql: string): string[] {
	return sql
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/--[^\n]*/g, ' ')
		.split(';')
		.map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
		.filter((s) => s.length > 0);
}

/** public スキーマ（スキーマ省略を含む）の表名なら表名を、それ以外は null を返す。 */
function publicTable(schema: string | undefined, table: string): string | null {
	if (schema !== undefined && unquote(schema) !== 'public') return null;
	return unquote(table);
}

/**
 * 全マイグレーションを名前順に走査し、違反メッセージを返す（空配列なら合格）。
 * - public に作られた表は、最終的に RLS が有効であること（後続の DISABLE も検出する）
 * - ポリシー（create policy）が1件も無いこと
 */
export function checkMigrations(files: MigrationFile[]): string[] {
	const violations: string[] = [];
	const rls = new Map<string, boolean>(); // 表名 -> RLS が有効か
	const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

	for (const file of sorted) {
		for (const statement of splitStatements(file.sql)) {
			const policy = CREATE_POLICY.exec(statement);
			if (policy) {
				violations.push(
					`${file.name}: create policy ${policy[1]} は禁止（ポリシーを作らない方針。docs/supabase-setup.md）`
				);
				continue;
			}
			const created = CREATE_TABLE.exec(statement);
			if (created) {
				const table = publicTable(created[1], created[2]);
				if (table !== null) rls.set(table, rls.get(table) ?? false);
				continue;
			}
			const altered = ALTER_RLS.exec(statement);
			if (altered) {
				const table = publicTable(altered[1], altered[2]);
				if (table !== null && rls.has(table)) rls.set(table, altered[3] === 'enable');
				continue;
			}
			const dropped = DROP_TABLE.exec(statement);
			if (dropped) {
				const table = publicTable(dropped[1], dropped[2]);
				if (table !== null) rls.delete(table);
			}
		}
	}

	for (const [table, enabled] of rls) {
		if (!enabled) {
			violations.push(
				`RLS が有効化されていないテーブル: public.${table}（同じマイグレーションで alter table public.${table} enable row level security を書く）`
			);
		}
	}
	return violations;
}

/** 作成された public テーブル名の一覧（検査が空振りしていないことの確認用）。 */
export function createdPublicTables(files: MigrationFile[]): string[] {
	const tables = new Set<string>();
	for (const file of files) {
		for (const statement of splitStatements(file.sql)) {
			const created = CREATE_TABLE.exec(statement);
			if (!created) continue;
			const table = publicTable(created[1], created[2]);
			if (table !== null) tables.add(table);
		}
	}
	return [...tables];
}
