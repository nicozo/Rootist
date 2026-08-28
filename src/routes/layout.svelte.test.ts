import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Layout from './+layout.svelte';

// issue #62: グローバルレイアウトの認証ナビ表示テスト。

const USER = { email: 'taro@example.com', name: 'たろう', image: null };

/** レイアウトが必須とする children スロットの代わり。 */
const children = createRawSnippet(() => ({
	render: () => '<main data-testid="page-content">本文</main>'
}));

/** children を補ってレイアウトを描画する。 */
function renderLayout(user: typeof USER | null) {
	return render(Layout, { data: { user }, children });
}

describe('/+layout.svelte', () => {
	it('未ログインならログイン・新規登録リンクを表示する', async () => {
		await renderLayout(null);

		await expect.element(page.getByRole('link', { name: 'ログイン' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: '新規登録' })).toBeInTheDocument();
	});

	it('未ログインならアバターメニューを表示しない', async () => {
		const { container } = await renderLayout(null);

		expect(container.querySelector('[aria-label="アカウントメニュー"]')).toBeNull();
	});

	it('ログイン中はアバターメニューを表示する', async () => {
		await renderLayout(USER);

		await expect
			.element(page.getByRole('button', { name: 'アカウントメニュー' }))
			.toBeInTheDocument();
	});

	it('ログイン中はログイン・新規登録リンクを表示しない', async () => {
		const { container } = await renderLayout(USER);

		expect(container.querySelector('a[href*="login"]')).toBeNull();
		expect(container.querySelector('a[href*="register"]')).toBeNull();
	});

	it('ナビにアクセシブルな名前を付ける', async () => {
		const { container } = await renderLayout(null);

		expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('アカウント');
	});

	it('ページ本文を描画する', async () => {
		const { container } = await renderLayout(null);

		expect(container.querySelector('[data-testid="page-content"]')?.textContent).toBe('本文');
	});
});
