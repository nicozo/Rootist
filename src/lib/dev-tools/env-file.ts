// issue #152: `.env` 形式（KEY=VALUE）の解釈。supabase-db.ts と worktree-env.ts が共有する（SSoT）。
//
// 制約: SvelteKit の仮想モジュールを import しない。Node の型除去でそのまま実行できる構文だけで書く。

export type EnvLine =
	| { kind: 'blank' | 'comment' | 'invalid' }
	| { kind: 'entry'; key: string; value: string };

/** 1 行を分類する。値の前後の対のクォート（" または '）は外す。`export KEY=` も同じキーとして読む。 */
export function parseEnvLine(rawLine: string): EnvLine {
	const line = rawLine.trim();
	if (line === '') return { kind: 'blank' };
	if (line.startsWith('#')) return { kind: 'comment' };
	const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
	if (!match) return { kind: 'invalid' };
	let value = match[2].trim();
	if (value.length >= 2) {
		const first = value[0];
		if ((first === '"' || first === "'") && value.endsWith(first)) value = value.slice(1, -1);
	}
	return { kind: 'entry', key: match[1], value };
}

/** .env の内容から KEY=VALUE を取り出す。同じキーは最後の出現が勝つ。解釈できない行は読み飛ばす。 */
export function parseEnvFile(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const parsed = parseEnvLine(rawLine);
		if (parsed.kind === 'entry') result[parsed.key] = parsed.value;
	}
	return result;
}

/** 解釈できない行（空行・コメント以外で KEY=VALUE にならない行）の行番号（1 始まり）。内容は返さない。 */
export function invalidLineNumbers(text: string): number[] {
	const numbers: number[] = [];
	text.split(/\r?\n/).forEach((rawLine, index) => {
		if (parseEnvLine(rawLine).kind === 'invalid') numbers.push(index + 1);
	});
	return numbers;
}
