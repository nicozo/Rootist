// ログインの送信は Supabase に届くため対象外（.claude/rules/testing.md）。
// Google ボタンの有無は環境で変わるため確認しない。
import { expect, test } from './helpers';

test('L-1: ナビの「ログイン」から /login に入る', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'アカウント' })
		.getByRole('link', { name: 'ログイン' })
		.click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page).toHaveTitle('rootist — ログイン');
	await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible();
	await expect(page.getByLabel('メールアドレス')).toBeVisible();
	await expect(page.getByLabel('パスワード')).toBeVisible();
});

test('L-2: 画面下の「新規登録」から /register に移る', async ({ page }) => {
	await page.goto('/login');
	await page.locator('[data-slot="card-footer"]').getByRole('link', { name: '新規登録' }).click();
	await expect(page).toHaveURL(/\/register$/);
	await expect(page.getByRole('heading', { level: 1, name: '新規登録' })).toBeVisible();
});

test('L-3: /login?error=google で Google ログイン失敗の文言が出る', async ({ page }) => {
	await page.goto('/login?error=google');
	await expect(
		page.getByText('Googleログインを完了できませんでした。もう一度お試しください。')
	).toBeVisible();
});
