// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import storybook from 'eslint-plugin-storybook';

import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import { loadConfig } from '@sveltejs/load-config';

const svelteConfig = (await loadConfig('./', { traverse: false }))?.config;

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },

		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],

		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// SvelteKit 3 で非推奨・廃止になった API を、型情報なしで名指しで禁止する（svelte-check は非推奨を警告しない）。
		// 型情報つきの汎用検出（no-deprecated）は .ts だけ eslint.deprecated.config.js で行う（.svelte に広げると lint が数分かかる）
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@sveltejs/kit',
							importNames: ['json', 'text'],
							message: 'json() / text() は非推奨。Response.json() / new Response() を使う'
						},
						{
							name: '$app/navigation',
							importNames: ['invalidateAll'],
							message: 'invalidateAll は非推奨。refreshAll を使う'
						}
					],
					patterns: [
						{
							group: ['$app/stores', '$app/environment', '$env/*'],
							message: '廃止・非推奨。$app/state / $app/env / $app/env/private を使う'
						},
						{ group: ['$lib', '$lib/*'], message: '$lib は廃止。#lib を使う' }
					]
				}
			]
		}
	},
	{
		// button.svelte is a generic UI primitive that accepts external href props —
		// it cannot use resolve() because the caller determines the path.
		files: ['src/lib/components/ui/button/button.svelte'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	}
);
