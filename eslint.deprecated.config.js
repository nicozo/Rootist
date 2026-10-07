// 型情報つきの非推奨 API 検出（@typescript-eslint/no-deprecated）。.ts だけが対象。
// eslint.config.js と同じプロセスで動かすと、.svelte 用の型解析サービスと競合して lint が 3 分以上かかり、
// メモリ不足になることがあるため、別の設定・別プロセスで実行する（pnpm lint から呼ぶ）。
// .svelte は eslint.config.js の no-restricted-imports で、SvelteKit 3 の非推奨 API を名指しで禁止している。
import { includeIgnoreFile } from '@eslint/compat';
import { defineConfig } from 'eslint/config';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default defineConfig(includeIgnoreFile(gitignorePath), {
	// tsconfig.json の include（src・vite.config.ts・scripts）に合わせる
	files: ['src/**/*.ts', 'scripts/**/*.ts', 'vite.config.ts'],
	// ui/ は shadcn の vendor コード。バレルの index.ts が .svelte を芋づる式に解析させ、極端に遅くなる
	ignores: ['src/lib/components/ui/**'],
	// 既存の eslint-disable コメントは eslint.config.js のルール用なので、未使用の警告は出さない
	linterOptions: { reportUnusedDisableDirectives: 'off' },
	languageOptions: { parser: ts.parser, parserOptions: { projectService: true } },
	plugins: { '@typescript-eslint': ts.plugin },
	rules: { '@typescript-eslint/no-deprecated': 'error' }
});
