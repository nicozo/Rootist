// 正しい入力での送信は Supabase に届くため対象外（.claude/rules/testing.md）。
// Google ボタンの有無は環境で変わるため確認しない。
import { expect, test, waitForHydration } from './helpers';
import type { Page } from '@playwright/test';

/** ブラウザの入力チェックを外して送る（Supabase に届く前のサーバー側の事前チェックで止まる入力のみ使う）。 */
async function submitWithoutBrowserValidation(page: Page, email: string, password: string) {
	await page.goto('/register');
	await waitForHydration(page);
	await page.evaluate(() => {
		const form = document.querySelector('form[method="POST"]:not([action])') as HTMLFormElement;
		form.noValidate = true;
		for (const input of form.querySelectorAll('input')) input.removeAttribute('minlength');
	});
	await page.getByLabel('メールアドレス').fill(email);
	await page.getByLabel('パスワード').fill(password);
	await page.getByLabel('パスワード').press('Enter');
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
});

test('R-2: 形式不正のメールは事前チェックの文言が出る', async ({ page }) => {
	await submitWithoutBrowserValidation(page, 'not-an-email', 'password123');
	await expect(page.getByText('メールアドレスの形式が正しくありません')).toBeVisible();
	await expect(page).toHaveURL(/\/register$/);
});

test('R-3: 7 文字のパスワードは事前チェックの文言が出る', async ({ page }) => {
	await submitWithoutBrowserValidation(page, 'taro@example.com', 'a'.repeat(7));
	await expect(page.getByText('パスワードは8文字以上で入力してください')).toBeVisible();
	await expect(page).toHaveURL(/\/register$/);
});

test('R-4: 画面下の「ログイン」から /login に移る', async ({ page }) => {
	await page.goto('/register');
	await page.locator('[data-slot="card-footer"]').getByRole('link', { name: 'ログイン' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible();
});
