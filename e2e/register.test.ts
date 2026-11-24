// /register は /login へ移すだけ（FR-009）。コードの送信は止めてあり Supabase に届かない（FR-011）。
import { expect, test } from './helpers';

const ORIGIN = 'http://localhost:4173';

test('R-1: /register を開くと /login に移る（FR-009）', async ({ page }) => {
	await page.goto('/register');
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { level: 1, name: 'ログイン' })).toBeVisible();
});

test('R-3: POST /register?/sendCode は 405（FR-011）', async ({ page }) => {
	const response = await page.request.post('/register?/sendCode', {
		headers: { Origin: ORIGIN },
		form: { email: 'a@example.com' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(405);
});
