import { expect, test, type Page } from '@playwright/test';

// issue #116: Supabase Authへの移行後の、Supabaseに接続しなくても確認できる範囲のE2E。
// CIと同じダミー環境変数（SUPABASE_URL=到達不能なURL）でも通ること。
// 実際の登録・ログイン・ログアウトの往復は実プロジェクトが必要なためここには含めない。

const ORIGIN = 'http://localhost:4173';

/** 未ログインの目印（描画済みナビ）。 */
async function expectLoggedOut(page: Page) {
	await expect(page.getByRole('link', { name: 'ログイン', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: '新規登録', exact: true })).toBeVisible();
	await expect(page.getByLabel('アカウントメニュー')).toHaveCount(0);
}

/** 形式は有効で期限内のダミーセッションを @supabase/ssr のCookie形式（base64url）にする。 */
function dummySessionCookieValue() {
	const session = {
		access_token: 'dummy.access.token',
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		refresh_token: 'dummy-refresh-token',
		user: {
			id: '00000000-0000-0000-0000-000000000000',
			aud: 'authenticated',
			email: 'dummy@example.com',
			user_metadata: {},
			app_metadata: {},
			created_at: '2026-01-01T00:00:00Z'
		}
	};
	return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

test('未ログインでトップを開くとナビに「ログイン」「新規登録」が出る', async ({ page }) => {
	await page.goto('/');
	await expectLoggedOut(page);
});

test.describe('/register の事前チェック（Supabaseに到達しない）', () => {
	async function submitWithoutBrowserValidation(page: Page, email: string, password: string) {
		await page.goto('/register');
		// SvelteKitのhydration完了後でないとJS有効のsubmitにならないため少し待つ
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);
		await page.evaluate(() => {
			const form = document.querySelector('form[method="POST"]:not([action])') as HTMLFormElement;
			form.noValidate = true;
			for (const input of form.querySelectorAll('input')) input.removeAttribute('minlength');
		});
		await page.locator('input[name="email"]').fill(email);
		await page.locator('input[name="password"]').fill(password);
		await page.locator('input[name="password"]').press('Enter');
	}

	test('形式不正のメールは日本語メッセージが出る', async ({ page }) => {
		await submitWithoutBrowserValidation(page, 'not-an-email', 'password123');
		await expect(page.getByText('メールアドレスの形式が正しくありません')).toBeVisible();
	});

	test('7文字のパスワードは日本語メッセージが出る', async ({ page }) => {
		await submitWithoutBrowserValidation(page, 'taro@example.com', 'a'.repeat(7));
		await expect(page.getByText('パスワードは8文字以上で入力してください')).toBeVisible();
	});
});

test.describe('壊れた・古い認証Cookieでも500にならず未ログイン表示になる', () => {
	const cases: [string, { name: string; value: string }][] = [
		['名前が sb- で始まらないCookie', { name: 'session_token', value: 'dummy' }],
		['名前が sb- で始まる壊れた値', { name: 'sb-abc-auth-token', value: 'garbage' }],
		[
			// ダミーURL(127.0.0.1)から作られるストレージキーに一致する、形式有効・期限内のセッション。
			// getUserが到達不能なSupabaseへ実際に通信を試みる経路を通す（I-2）
			'形式有効で期限内のダミーセッション(sb-127-auth-token)',
			{ name: 'sb-127-auth-token', value: dummySessionCookieValue() }
		]
	];

	for (const [label, cookie] of cases) {
		for (const path of ['/', '/plan']) {
			test(`${label}: ${path} が200で未ログイン表示`, async ({ page, context }) => {
				await context.addCookies([{ ...cookie, url: ORIGIN }]);
				const response = await page.goto(path);
				expect(response?.status()).toBe(200);
				await expectLoggedOut(page);
			});
		}
	}
});
