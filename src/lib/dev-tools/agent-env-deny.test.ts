import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

// issue #152: `.claude/settings.json` の deny の退行を CI で検知する回帰ガード。
//
// 注意: ここで使う「簡易マッチャー」は Claude Code の実マッチングの再実装ではない（`*` と複合コマンドの分割だけ）。
// 実挙動の正は使い捨てダミーでの実測（issue #152 の G-1〜G-5）。ここは設定の書き換えで形が崩れたことを検知するためのもの。
// このテストが読むのは追跡されている `.claude/settings.json` だけで、実値の入った環境ファイルは一切開かない。

const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
	enabledPlugins?: Record<string, boolean>;
	permissions?: { deny?: string[] };
};
const deny = settings.permissions?.deny ?? [];

/** `Tool(pattern)` から pattern を取り出す。 */
function rulesFor(tool: string): string[] {
	const prefix = `${tool}(`;
	return deny
		.filter((rule) => rule.startsWith(prefix) && rule.endsWith(')'))
		.map((rule) => rule.slice(prefix.length, -1));
}

function escapeRegExp(text: string): string {
	return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/** `*` を `wildcard` に置き換えた全体一致の正規表現を作る。 */
function globToRegExp(pattern: string, wildcard: string): RegExp {
	return new RegExp('^' + pattern.split('*').map(escapeRegExp).join(wildcard) + '$');
}

/** Bash 規則: `*` は任意の文字列。末尾が ` *` のときは引数なしにも一致する。 */
function bashMatches(pattern: string, command: string): boolean {
	if (globToRegExp(pattern, '.*').test(command)) return true;
	return pattern.endsWith(' *') && globToRegExp(pattern.slice(0, -2), '.*').test(command);
}

/** 複合コマンド・パイプはサブコマンドに分け、どれかが一致すれば deny に当たる。 */
function bashDenied(command: string): boolean {
	const rules = rulesFor('Bash');
	return command
		.split(/&&|\|\||\||;/)
		.map((part) => part.trim())
		.some((part) => rules.some((rule) => bashMatches(rule, part)));
}

// ファイル規則: 絶対パス形（//**/名前）と cwd 相対の bare な名前は、パスの最後の要素が名前（* 可）に一致する。
// 先頭が ! の規則は、それより前の規則に一致したパスを除外する（carve-out）。
function fileDenied(tool: 'Read' | 'Edit', path: string): boolean {
	const base = path.split('/').pop() ?? '';
	const nameOf = (rule: string) => /^(?:\/\/\*\*\/)?([^/]+)$/.exec(rule)?.[1] ?? null;
	let denied = false;
	for (const rule of rulesFor(tool)) {
		const negated = rule.startsWith('!');
		const name = nameOf(negated ? rule.slice(1) : rule);
		if (name === null || !globToRegExp(name, '[^/]*').test(base)) continue;
		denied = !negated;
	}
	return denied;
}

const REAL_FILES = [
	'.env',
	'.env.local',
	'.env.development',
	'.env.production',
	'.env.test',
	'.env.production.local',
	'.env.development.local',
	'.env.test.local'
];
const BASES = ['', './', '/abs/dir/', '.claude/worktrees/wt/', '../../../'];

// 窓口コマンドの一時ファイル名（worktree-env.ts の tempFileName と同じ形）
const TEMP_FILE = '.env.worktree-env-123.local';
// 列挙外の名前（cwd 相対の catch-all（.env.* と !.env.example）が止める）
const OTHER_NAMES = ['.env.bak', '.env.staging', '.env.copy-test'];

describe('設定の形', () => {
	it('enabledPlugins を保ち、deny を持つ', () => {
		expect(settings.enabledPlugins).toBeDefined();
		expect(deny.length).toBeGreaterThan(0);
	});

	it('Write(...) / Glob(...) のパス規則を書かない（Claude Code は参照しない）', () => {
		expect(deny.filter((rule) => /^(Write|Glob|NotebookEdit)\(/.test(rule))).toEqual([]);
	});
});

describe('ファイル系（Read / Edit）', () => {
	for (const tool of ['Read', 'Edit'] as const) {
		it(`${tool}: 実値ファイル 6 種と列挙外の名前を、どの位置でも拒否する`, () => {
			for (const base of BASES) {
				for (const name of [...REAL_FILES, TEMP_FILE, ...OTHER_NAMES]) {
					expect(fileDenied(tool, `${base}${name}`), `${base}${name}`).toBe(true);
				}
			}
		});

		it(`${tool}: .env.example はどの位置でも拒否しない`, () => {
			for (const base of BASES) {
				expect(fileDenied(tool, `${base}.env.example`), `${base}.env.example`).toBe(false);
			}
		});
	}
});

describe('シェル（Bash）', () => {
	const MUST_DENY = [
		'cat .env',
		'cat ./.env',
		'cat /abs/dir/.env',
		'cat .claude/worktrees/wt/.env',
		'cat .env.local',
		'head .env',
		'tail -n 5 .env',
		'less .env',
		'more .env',
		'grep SENTINEL .env',
		'grep -n . .env.local',
		'rg SENTINEL .env',
		'sed -n p .env',
		"awk '{print}' .env",
		'cd .claude/worktrees/wt && cat .env',
		'cat .env | head -n 1',
		'source .env && echo "$SENTINEL_152_DO_NOT_LEAK"',
		'. ./.env && echo "$SENTINEL_152_DO_NOT_LEAK"',
		'cat ".env"',
		"cat '/abs/dir/.env'",
		'diff .env.example .env',
		'head -n 3 < .env',
		'tr -d x < .env',
		'cp .env /dev/stdout',
		'git diff --no-index /dev/null .env',
		'dd if=.env',
		'cat .env.production.local',
		'cat .env.test',
		'cat .env.development',
		'docker compose config',
		'docker compose --profile dev config',
		'docker-compose config',
		'docker inspect x',
		'docker compose exec app env',
		'docker exec app printenv',
		'printenv',
		'printenv HOME',
		'env',
		'export -p',
		'set'
	];

	const MUST_ALLOW = [
		'cat .env.example',
		'cat ./.env.example',
		'cat /abs/dir/.env.example',
		'head .env.example',
		'grep -c SAMPLE .env.example',
		'diff .env.example .env.example',
		'cat .env.example 2>/dev/null',
		// 次の 2 行は「Bash の deny 規則には一致しない」ことだけの確認。実際の Claude Code では、ファイル引数を持つ
		// コマンドに Read の deny（//**/.env）が適用されるため、cp .env と ls -la .env は拒否される（実測。規則ファイル参照）
		'cp .env .claude/worktrees/wt/.env.copy-test',
		'test -f .env && echo exists',
		'ls -la .env',
		'git status --short --ignored',
		'env FOO=1 true',
		'pnpm -s worktree-env --help',
		'pnpm -s worktree-env get DEV_PORT',
		'pnpm -s worktree-env setup 152',
		'pnpm dev',
		'pnpm test:unit -- --run',
		'pnpm check',
		'pnpm lint',
		'pnpm db:status',
		'docker compose ps',
		'docker compose -p rootist-issue-1 --profile dev down --volumes --remove-orphans',
		'set -e',
		// 検索式は [.]env 形＋パターンファイルから読む（式自体が deny に当たらない）
		'grep -nE -f /tmp/a7.pat .claude/skills/dev-loop/SKILL.md',
		"grep -n '[.]env' CLAUDE.md"
	];

	it('拒否すべき形（spec G-3 と契約の追加）がすべて deny に当たる', () => {
		for (const command of MUST_DENY) {
			expect(bashDenied(command), command).toBe(true);
		}
	});

	it('通すべき形（.env.example・コピー・存在確認・開発コマンド）はどの deny にも当たらない', () => {
		for (const command of MUST_ALLOW) {
			expect(bashDenied(command), command).toBe(false);
		}
	});

	it('コマンド集合の各コマンドに、引数の形がすべて揃っている', () => {
		// 形は `<cmd> <F>`。コマンド集合は settings.json から導出する（テストに複製しない）。
		const FORMS = [
			'*.env',
			'*.env *',
			'*.env.l*',
			'*.env.d*',
			'*.env.p*',
			'*.env.t*',
			'*.env"*',
			"*.env'*"
		];
		const byCommand = new Map<string, Set<string>>();
		for (const rule of rulesFor('Bash')) {
			for (const form of FORMS) {
				if (rule.endsWith(` ${form}`)) {
					const command = rule.slice(0, -(form.length + 1));
					if (command.includes(' ')) continue; // `git diff --no-index` 等の個別規則
					byCommand.set(command, (byCommand.get(command) ?? new Set()).add(form));
				}
			}
		}
		// `*.env *` と `*.env.l*` 等は接尾辞の重なりがあるため、各コマンドが形の全集合を持つことで確認する
		const required = [
			'cat',
			'head',
			'tail',
			'less',
			'more',
			'grep',
			'rg',
			'sed',
			'awk',
			'source',
			'.'
		];
		for (const command of required) expect(byCommand.has(command), command).toBe(true);
		for (const [command, forms] of byCommand) {
			expect([...forms].sort(), command).toEqual([...FORMS].sort());
		}
	});
});
