// issue #138: PR のマイグレーション変更が「マージ＝共有 DB への自動適用」に耐えるかの静的検査。
// 入口は scripts/check-migrations.mjs（git の実行と終了コードの扱いはそちらが持つ）。判定ロジックだけをここに置く。
//
// 検査するもの（spec §5-3 / 契約 §1-1）:
// - 差分は追加（A）だけ許可する。変更・削除・リネーム・コピー・型変更・競合（M/D/R/C/T/U など）はすべて失敗
//   （適用済みの SQL を書き換えても再適用されず、DB と main がずれるため）
// - ファイル名は Supabase CLI が適用対象にする `<数字>_<名前>.sql` の部分集合に合うこと
//   （合わないファイルは CLI が黙って飛ばす）
// - 追加したマイグレーションのタイムスタンプ（14 桁）は、base の既存すべてより厳密に新しいこと（同時刻は失敗）
//
// 制約: SvelteKit の仮想モジュールを import しない。Node の型除去でそのまま実行できる構文だけで書く。

/** `pnpm db:new` が生成する名前（英小文字・数字・_）と Supabase CLI の `<数字>_<名前>.sql` の部分集合。 */
export const MIGRATION_FILE_PATTERN = /^[0-9]{14}_[a-z0-9_]+\.sql$/;

export const MIGRATIONS_DIR = 'supabase/migrations';

export type DiffEntry = { status: string; paths: string[] };

/**
 * `git diff --name-status` の出力を解釈する。列はタブ区切りで、R / C は `R100<TAB>old<TAB>new` の 3 列。
 * 解釈できない行（タブが無い等）は status を '?' にして失敗側へ倒す。
 */
export function parseNameStatus(output: string): DiffEntry[] {
	const entries: DiffEntry[] = [];
	for (const line of output.split(/\r?\n/)) {
		if (line.trim() === '') continue;
		const [status, ...paths] = line.split('\t');
		if (status === undefined || status === '' || paths.length === 0) {
			entries.push({ status: '?', paths: [line] });
			continue;
		}
		entries.push({ status, paths });
	}
	return entries;
}

/** `git ls-tree --name-only` の出力（パス 1 行 1 件）からファイル名（basename）の一覧を作る。 */
export function listNames(output: string): string[] {
	return output
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l !== '')
		.map((l) => l.slice(l.lastIndexOf('/') + 1));
}

function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

function timestampOf(name: string): string | null {
	return MIGRATION_FILE_PATTERN.test(name) ? name.slice(0, 14) : null;
}

/**
 * 違反メッセージを返す（空配列なら合格）。
 * - baseNames: base ブランチ時点の supabase/migrations のファイル名
 * - headNames: HEAD 時点の supabase/migrations のファイル名
 * - diff: base...HEAD の name-status
 */
export function checkMigrationGuard(input: {
	baseNames: string[];
	headNames: string[];
	diff: DiffEntry[];
}): string[] {
	const violations: string[] = [];

	for (const entry of input.diff) {
		if (entry.status === 'A') continue;
		violations.push(
			`追加（A）以外の変更は禁止: ${entry.status} ${entry.paths.join(' -> ')}（適用済みのマイグレーションは変更・削除・リネームしない。直すときは新しいマイグレーションを追加する）`
		);
	}

	for (const name of input.headNames) {
		if (!MIGRATION_FILE_PATTERN.test(name)) {
			violations.push(
				`ファイル名が形式に合わない: ${name}（${MIGRATION_FILE_PATTERN.source}。Supabase CLI は合わないファイルを黙って飛ばす。pnpm db:new で作る）`
			);
		}
	}

	const baseTimestamps = input.baseNames
		.map(timestampOf)
		.filter((t): t is string => t !== null)
		.sort();
	const baseMax = baseTimestamps.length > 0 ? baseTimestamps[baseTimestamps.length - 1] : null;

	if (baseMax !== null) {
		for (const entry of input.diff) {
			if (entry.status !== 'A') continue;
			const name = baseName(entry.paths[0] ?? '');
			const ts = timestampOf(name);
			if (ts === null) continue; // 形式違反は上で報告済み
			if (ts <= baseMax) {
				violations.push(
					`タイムスタンプが base の最新（${baseMax}）以前: ${name}（同時刻も不可。main を取り込み、pnpm db:new で作り直すかタイムスタンプを付け直す）`
				);
			}
		}
	}

	return violations;
}
