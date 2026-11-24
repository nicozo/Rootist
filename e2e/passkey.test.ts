// パスキーは廃止した（issue #199）。ここでは /passkey が 404 になることだけを確かめる（FR-016）。
import { expect, test } from './helpers';

test('P-1: 未ログインで /passkey を開くと 404 になる', async ({ page }) => {
	const response = await page.goto('/passkey');
	expect(response?.status()).toBe(404);
});
