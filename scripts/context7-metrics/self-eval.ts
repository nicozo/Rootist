/** 使用記録節の固定見出し。generator.md の雛形と一致させる。 */
export const SECTION_HEADING = '## Context7 使用記録';

export interface SelfEvaluation {
	/** 固定見出しの節があるか（コードフェンス外・行頭完全一致）。 */
	hasSection: boolean;
	/** 使用表のデータ行数（ヘッダ・区切り行・空行/ハイフンのみの行を除く）。 */
	usedRows: number;
	/** 「該当場面: あり / なし」の値。読めなければ null。 */
	scene: 'あり' | 'なし' | null;
}

const FENCE = /^\s*(```|~~~)/;
const SEPARATOR = /^\|?[\s:|-]+\|?$/;

function cells(line: string): string[] {
	return line
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((c) => c.trim());
}

/**
 * self_evaluation.md の本文から使用記録節を解析する。
 * 見出しは行頭が `## Context7 使用記録` と完全一致（末尾空白のみ許容）のものだけ。
 * `## 3. Context7 / ...` のような部分一致の見出しや、コードフェンス内の雛形は節とみなさない。
 */
export function parseSelfEvaluation(markdown: string): SelfEvaluation {
	const lines = markdown.split(/\r?\n/);
	let inFence = false;
	let start = -1;
	let end = lines.length;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (FENCE.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (start < 0) {
			if (line.replace(/\s+$/, '') === SECTION_HEADING) start = i;
		} else if (/^## /.test(line)) {
			end = i;
			break;
		}
	}
	if (start < 0) return { hasSection: false, usedRows: 0, scene: null };

	// 節の中身（フェンス内は除く）
	const body: string[] = [];
	inFence = false;
	for (let i = start + 1; i < end; i++) {
		if (FENCE.test(lines[i])) {
			inFence = !inFence;
			continue;
		}
		if (!inFence) body.push(lines[i]);
	}

	let scene: SelfEvaluation['scene'] = null;
	for (const line of body) {
		const m = /該当場面\s*[:：]\s*\**\s*(あり|なし)/.exec(line);
		if (m && !/該当場面の内容/.test(line)) {
			scene = m[1] as 'あり' | 'なし';
			break;
		}
	}

	// 使用表: 最初の表のヘッダ → 区切り行の後ろをデータ行として数える
	let usedRows = 0;
	let seenSeparator = false;
	let inTable = false;
	for (const line of body) {
		const t = line.trim();
		if (!t.startsWith('|')) {
			if (inTable && seenSeparator) break;
			inTable = false;
			seenSeparator = false;
			continue;
		}
		inTable = true;
		if (!seenSeparator) {
			if (SEPARATOR.test(t)) seenSeparator = true;
			continue;
		}
		if (cells(t).some((c) => c !== '' && c !== '-' && c !== '—')) usedRows++;
	}
	return { hasSection: true, usedRows, scene };
}
