// Google の認証そのもの（実の Google ログイン）は対象外（.claude/rules/testing.md）。
// Google ボタンの有無は環境で変わるため確認しない。
import { expect, test } from './helpers';

// SvelteKit の CSRF 検査（Origin）で 403 にならないよう、同一オリジンの form 本文で送る。
const ORIGIN = 'http://localhost:4173';

test('L-1: ナビの「ログイン」から /login に入り、自前の入力欄が無い', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'アカウント' })
		.getByRole('link', { name: 'ログイン' })
		.click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page).toHaveTitle('rootist — ログイン');
	await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible();
	// FR-002: メールアドレス・コード・パスワードの入力欄は無い
	await expect(page.getByLabel('メールアドレス')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'コードを送る' })).toHaveCount(0);
	await expect(page.getByLabel('パスワード')).toHaveCount(0);
});

test('L-3: /login?error=google で Google ログイン失敗の文言が出る', async ({ page }) => {
	await page.goto('/login?error=google');
	await expect(
		page.getByText('Googleログインを完了できませんでした。もう一度お試しください。')
	).toBeVisible();
});

for (const action of ['sendCode', 'verifyCode']) {
	test(`L-4: POST /login?/${action} は 405（form action が無い。FR-011）`, async ({ page }) => {
		const response = await page.request.post(`/login?/${action}`, {
			headers: { Origin: ORIGIN },
			form: { email: 'a@example.com', code: '123456' }
		});
		expect(response.status()).toBe(405);
	});
}
