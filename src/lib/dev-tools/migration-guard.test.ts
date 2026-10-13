import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import {
	MIGRATION_FILE_PATTERN,
	checkMigrationGuard,
	listNames,
	parseNameStatus
} from './migration-guard';

// issue #138: PR のマイグレーション変更の検査（追加のみ・ファイル名形式・タイムスタンプ順）。純粋関数のテスト。
// git の実行と終了コードの扱いは scripts/check-migrations.mjs 側（CI と同じコマンドを A-3 で実行して確かめる）。

const BASE = ['20261004000000_baseline_plans.sql'];
const dir = 'supabase/migrations';

function check(over: { baseNames?: string[]; headNames?: string[]; diff?: string }) {
	const baseNames = over.baseNames ?? BASE;
	return checkMigrationGuard({
		baseNames,
		headNames: over.headNames ?? baseNames,
		diff: parseNameStatus(over.diff ?? '')
	});
}

describe('実際の supabase/migrations のファイル名', () => {
	const names = readdirSync(new URL('../../../supabase/migrations/', import.meta.url));

	it('1件以上読み、すべてが形式に合う（ベースラインを含む。0件で素通りしない）', () => {
		expect(names.length).toBeGreaterThanOrEqual(1);
		expect(names).toContain('20261004000000_baseline_plans.sql');
		for (const name of names) expect(MIGRATION_FILE_PATTERN.test(name), name).toBe(true);
	});
});

describe('MIGRATION_FILE_PATTERN', () => {
	it.each([
		['20261004000000_baseline_plans.sql', true],
		['20261005123456_comment_on_plans.sql', true],
		['foo.sql', false],
		['2026100400000_short.sql', false], // 13 桁
		['202610040000000_long.sql', false], // 15 桁
		['20261004000000_Upper.sql', false],
		['20261004000000_has-hyphen.sql', false], // db:new は - を受け付けない
		['20261004000000_.sql', false],
		['20261004000000_x.sql.bak', false],
		['20261004000000_x.txt', false]
	])('%s => %s', (name, ok) => {
		expect(MIGRATION_FILE_PATTERN.test(name)).toBe(ok);
	});
});

describe('parseNameStatus / listNames', () => {
	it('R は 3 列（R100<TAB>old<TAB>new）で解析がずれない', () => {
		const out = `R100\t${dir}/a.sql\t${dir}/b.sql\nA\t${dir}/c.sql\n`;
		expect(parseNameStatus(out)).toEqual([
			{ status: 'R100', paths: [`${dir}/a.sql`, `${dir}/b.sql`] },
			{ status: 'A', paths: [`${dir}/c.sql`] }
		]);
	});

	it('解釈できない行は失敗側（status ?）に倒す', () => {
		expect(parseNameStatus('garbage line')).toEqual([{ status: '?', paths: ['garbage line'] }]);
	});

	it('空出力は 0 件', () => {
		expect(parseNameStatus('')).toEqual([]);
		expect(listNames('')).toEqual([]);
	});

	it('ls-tree の出力から basename を取る', () => {
		expect(listNames(`${dir}/a.sql\n${dir}/b.sql\n`)).toEqual(['a.sql', 'b.sql']);
	});
});

describe('checkMigrationGuard', () => {
	it('差分なしは合格', () => {
		expect(check({})).toEqual([]);
	});

	it('base より新しい追加は合格', () => {
		const added = '20261005000000_comment_on_plans.sql';
		expect(check({ headNames: [...BASE, added], diff: `A\t${dir}/${added}` })).toEqual([]);
	});

	it('PR 内で複数追加しても、各々が base の最大より新しければ互いの順序は問わない', () => {
		const a = '20261007000000_b.sql';
		const b = '20261006000000_a.sql';
		expect(check({ headNames: [...BASE, a, b], diff: `A\t${dir}/${a}\nA\t${dir}/${b}` })).toEqual(
			[]
		);
	});

	it('base と同時刻は失敗', () => {
		const added = '20261004000000_other.sql';
		const v = check({ headNames: [...BASE, added], diff: `A\t${dir}/${added}` });
		expect(v).toHaveLength(1);
		expect(v[0]).toContain('タイムスタンプ');
	});

	it('base の最新より古い追加は失敗し、ファイル名が出る', () => {
		const added = '20250101000000_old.sql';
		const v = check({ headNames: [...BASE, added], diff: `A\t${dir}/${added}` });
		expect(v).toHaveLength(1);
		expect(v[0]).toContain(added);
	});

	it('base に複数あるとき、最新との比較になる（途中のタイムスタンプは通らない）', () => {
		const baseNames = ['20261004000000_a.sql', '20261010000000_b.sql'];
		const added = '20261006000000_mid.sql';
		const v = check({
			baseNames,
			headNames: [...baseNames, added],
			diff: `A\t${dir}/${added}`
		});
		expect(v).toHaveLength(1);
	});

	it('既存ファイルの変更（M）は失敗', () => {
		const v = check({ diff: `M\t${dir}/${BASE[0]}` });
		expect(v).toHaveLength(1);
		expect(v[0]).toContain('M');
	});

	it('既存ファイルの削除（D）は失敗', () => {
		expect(check({ headNames: [], diff: `D\t${dir}/${BASE[0]}` }).length).toBeGreaterThanOrEqual(1);
	});

	it('リネーム（R100）・コピー（C）・型変更（T）・競合（U）も失敗', () => {
		for (const status of ['R100', 'C100', 'T', 'U']) {
			const diff =
				status === 'R100' || status === 'C100'
					? `${status}\t${dir}/a.sql\t${dir}/b.sql`
					: `${status}\t${dir}/a.sql`;
			const v = check({ diff });
			expect(v.length, status).toBeGreaterThanOrEqual(1);
		}
	});

	it('ファイル名の形式違反は失敗（CLI が黙って飛ばすため）', () => {
		const v = check({ headNames: [...BASE, 'foo.sql'], diff: `A\t${dir}/foo.sql` });
		expect(v).toHaveLength(1);
		expect(v[0]).toContain('foo.sql');
	});

	it('解釈できない差分行は失敗', () => {
		expect(check({ diff: 'garbage' }).length).toBeGreaterThanOrEqual(1);
	});
});

describe('入口スクリプト scripts/check-migrations.mjs（fail-closed）', () => {
	const script = new URL('../../../scripts/check-migrations.mjs', import.meta.url).pathname;

	it('存在しない base ref を渡すと、違反なし扱いにならず非ゼロ（2）で終わる', () => {
		const r = spawnSync('node', [script, 'does-not-exist'], { encoding: 'utf8' });
		expect(r.status).toBe(2);
		expect(r.stderr).toContain('git');
	});

	it('引数が無いときも非ゼロ（2）で終わる', () => {
		const r = spawnSync('node', [script], { encoding: 'utf8' });
		expect(r.status).toBe(2);
	});
});
