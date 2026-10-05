// issue #138: CI の `migrations` ジョブの入口。判定ロジックは src/lib/dev-tools/migration-guard.ts（単体テスト済み）。
// git は shell を介さず spawnSync で起動し、終了コードを必ず確認する（パイプを使わない）。
// git の失敗（base ref が無い・shallow clone など）は「違反なし」ではなく失敗として扱う（fail-closed）。
// 使い方: node scripts/check-migrations.mjs <base ブランチ名>   （例: main。内部で origin/<名前> を使う）
// 終了コード: 0=合格 / 1=違反あり / 2=引数または git の失敗
import { spawnSync } from 'node:child_process';
import {
	MIGRATIONS_DIR,
	checkMigrationGuard,
	listNames,
	parseNameStatus
} from '../src/lib/dev-tools/migration-guard.ts';

function git(args) {
	const r = spawnSync('git', args, { encoding: 'utf8' });
	if (r.error || r.status !== 0) {
		console.error(`git ${args.join(' ')} が失敗しました（終了コード: ${r.status ?? 'なし'}）`);
		if (r.stderr) console.error(r.stderr.trim());
		process.exit(2);
	}
	return r.stdout;
}

const baseBranch = process.argv[2];
if (!baseBranch || process.argv.length !== 3) {
	console.error('使い方: node scripts/check-migrations.mjs <base ブランチ名>');
	process.exit(2);
}
const baseRef = `origin/${baseBranch}`;

const diff = parseNameStatus(
	git(['diff', '--name-status', `${baseRef}...HEAD`, '--', MIGRATIONS_DIR])
);
const baseNames = listNames(git(['ls-tree', '--name-only', baseRef, `${MIGRATIONS_DIR}/`]));
const headNames = listNames(git(['ls-tree', '--name-only', 'HEAD', `${MIGRATIONS_DIR}/`]));

if (headNames.length === 0) {
	console.error(`${MIGRATIONS_DIR}/ にファイルが 1 件も無いため検査できません（0 件素通りの防止）`);
	process.exit(2);
}

const violations = checkMigrationGuard({ baseNames, headNames, diff });
if (violations.length > 0) {
	for (const v of violations) console.error(`NG: ${v}`);
	process.exit(1);
}
console.log(
	`OK: base=${baseRef} / base ${baseNames.length} 件・HEAD ${headNames.length} 件・差分 ${diff.length} 件`
);
