// パスキーの登録・ログインは Supabase に届くため対象外（.claude/rules/testing.md）。
// ここでは URL のルーティングだけを確かめる。
import { expect, test } from './helpers';

test('P-1: 未ログインで /passkey を開くと /login に移る', async ({ page }) => {
	await page.goto('/passkey');
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible();
});
