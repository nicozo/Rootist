import tailwindcss from '@tailwindcss/vite';
import { defineConfig, lazyPlugins } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	staged: {
		'*.{js,ts,svelte}': 'eslint --fix',
		'*': 'vp fmt --no-error-on-unmatched-pattern'
	},
	fmt: {
		useTabs: true,
		singleQuote: true,
		trailingComma: 'none',
		printWidth: 100,
		sortPackageJson: false,
		sortTailwindcss: {
			stylesheet: './src/routes/layout.css'
		},
		svelte: {},
		ignorePatterns: [
			'package-lock.json',
			'pnpm-lock.yaml',
			'yarn.lock',
			'bun.lock',
			'bun.lockb',
			'/static/'
		]
	},
	plugins: lazyPlugins(() => [tailwindcss(), sveltekit()]),

	test: {
		// Vitest v4 compatibility: preserve mock call history.
		// Remove after tests no longer rely on calls from setup or earlier tests.
		// https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
		// https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
		clearMocks: false,
		// Vitest v4 compatibility: keep separate Vite servers for inline projects.
		// Remove when plugins and config hooks can run once for shared projects.
		// https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
		// https://vitest.dev/guide/migration/#inline-projects-share-the-vite-server-by-default
		sharedViteServer: false,
		expect: { requireAssertions: true },

		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'json-summary'],
			include: ['src/**/*.{ts,svelte}'],
			exclude: [
				'src/**/*.{test,spec}.{js,ts}',
				'src/**/*.svelte.{test,spec}.{js,ts}',
				// 実行可能コードを持たない型定義
				'src/**/*.d.ts',
				// shadcn-svelte CLIが生成するベンダーコード。自前のロジックではなく、
				// アプリが使っていないパーツも含まれるため計測対象から外す
				// （利用箇所はアプリ側のコンポーネント・ページのテストで通る）
				'src/lib/components/ui/**',
				// Storybookの初期セットアップ用サンプル
				'src/stories/**'
			]
		},

		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'client',

					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},

					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
