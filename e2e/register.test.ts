// コードの送信（正しいメールアドレス）は Supabase に届くため対象外（.claude/rules/testing.md）。
// Google ボタンの有無は環境で変わるため確認しない。
import { expect, test, waitForHydration } from './helpers';
import type { Page } from '@playwright/test';

/** ブラウザの入力チェックを外して送る（Supabase に届く前のサーバー側の事前チェックで止まる入力のみ使う）。 */
async function submitWithoutBrowserValidation(page: Page, email: string) {
	await page.goto('/register');
	await waitForHydration(page);
	await page.evaluate(() => {
		const form = document.querySelector('form[action="?/sendCode"]') as HTMLFormElement;
		form.noValidate = true;
	});
	await page.getByLabel('メールアドレス').fill(email);
	await page.getByLabel('メールアドレス').press('Enter');
}

test('R-1: ナビの「新規登録」から /register に入る', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'アカウント' })
		.getByRole('link', { name: '新規登録' })
		.click();
	await expect(page).toHaveURL(/\/register$/);
	await expect(page).toHaveTitle('rootist — 新規登録');
	await expect(page.getByRole('heading', { level: 1, name: '新規登録' })).toBeVisible();
	await expect(page.getByLabel('メールアドレス')).toBeVisible();
	await expect(page.getByRole('button', { name: 'コードを送る' })).toBeVisible();
	// issue #189 FR-001: パスワードの入力欄は無い
	await expect(page.getByLabel('パスワード')).toHaveCount(0);
});

test('R-2: 形式不正のメールは事前チェックの文言が出る', async ({ page }) => {
	await submitWithoutBrowserValidation(page, 'not-an-email');
	await expect(page.getByText('メールアドレスの形式が正しくありません')).toBeVisible();
	await expect(page).toHaveURL(/\/register$/);
});

test('R-4: 画面下の「ログイン」から /login に移る', async ({ page }) => {
	await page.goto('/register');
	await page.locator('[data-slot="card-footer"]').getByRole('link', { name: 'ログイン' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible();
});
