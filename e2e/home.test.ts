import { expect, test } from './helpers';

test('H-1: トップを開くとタイトルと h1 が見える（hydration 後に描画される）', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('rootist — 行きたい場所から旅行プランを作成');
	await expect(page.getByRole('heading', { level: 1, name: 'Rootist AI' })).toBeVisible();
});

test('H-2: 「旅を始める」を押すと /plan に移る', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: '旅を始める' }).click();
	await expect(page).toHaveURL(/\/plan$/);
	await expect(page.getByRole('heading', { level: 1, name: '旅行プランをつくる' })).toBeVisible();
});
