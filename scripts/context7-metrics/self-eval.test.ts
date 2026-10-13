import { describe, expect, it } from 'vite-plus/test';
import { parseSelfEvaluation } from './self-eval.ts';

const TABLE = '| ライブラリ | バージョン |\n| --- | --- |\n';

describe('parseSelfEvaluation', () => {
	it('T-10: 節あり・使用表のデータ行・該当場面を読む', () => {
		const md = `# x\n\n## Context7 使用記録\n\n- 該当場面: あり\n- 該当場面の内容: テスト\n\n${TABLE}| @supabase/ssr | ^0.1 |\n\n- 障害: なし\n\n## 次\n`;
		expect(parseSelfEvaluation(md)).toEqual({ hasSection: true, usedRows: 1, scene: 'あり' });
	});
	it('節あり・データ行なし（該当場面なし）', () => {
		const md = `## Context7 使用記録\n\n- 該当場面: なし\n\n${TABLE}\n- 使用しなかった理由: 該当場面なし\n`;
		expect(parseSelfEvaluation(md)).toEqual({ hasSection: true, usedRows: 0, scene: 'なし' });
	});
	it('T-10: 節なし', () => {
		expect(parseSelfEvaluation('# x\n\n## 他の節\n')).toEqual({
			hasSection: false,
			usedRows: 0,
			scene: null
		});
	});
	it('T-15: コードフェンス内の雛形は節とみなさない', () => {
		const md = '## 雛形\n\n```\n## Context7 使用記録\n\n| a | b |\n| - | - |\n| x | y |\n```\n';
		expect(parseSelfEvaluation(md).hasSection).toBe(false);
	});
	it('T-16: `## 3. Context7 / ...` のような部分一致の見出しは節とみなさない', () => {
		expect(
			parseSelfEvaluation('## 3. Context7 / 公式ドキュメントの確認結果（記録）\n\n本文\n')
				.hasSection
		).toBe(false);
		expect(parseSelfEvaluation('### Context7 使用記録\n').hasSection).toBe(false);
	});
	it('見出し末尾の空白は許容する', () => {
		expect(parseSelfEvaluation('## Context7 使用記録   \n\n- 該当場面: なし\n').hasSection).toBe(
			true
		);
	});
});
