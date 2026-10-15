// 画面横断: 認証 Cookie が壊れていても 500 にならず、未ログイン表示になること。
// 実際のログイン・ログアウトは Supabase が必要なため範囲外（.claude/rules/testing.md）。
import { expect, expectLoggedOut, test } from './helpers';

const ORIGIN = 'http://localhost:4173';

/** 形式は有効で期限内のダミーセッションを @supabase/ssr の Cookie 形式（base64url）にする。 */
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

test('C-0: Cookie なしでトップを開くと未ログイン表示', async ({ page }) => {
	await page.goto('/');
	await expectLoggedOut(page);
});

const cases = [
	{ id: 'C-1', label: 'sb- で始まらない Cookie', name: 'session_token', value: 'dummy' },
	{ id: 'C-2', label: 'sb- で始まる壊れた値', name: 'sb-abc-auth-token', value: 'garbage' },
	{
		// ダミー URL(127.0.0.1)から作られる Cookie 名に一致する、形式有効・期限内のセッション。
		// CI では到達できない Supabase への通信を実際に通る。
		id: 'C-3',
		label: '形式有効で期限内のダミーセッション(sb-127-auth-token)',
		name: 'sb-127-auth-token',
		value: dummySessionCookieValue()
	}
];

for (const { id, label, name, value } of cases) {
	for (const path of ['/', '/plan']) {
		test(`${id} ${path}: ${label} でも 200 で未ログイン表示`, async ({ page, context }) => {
			await context.addCookies([{ name, value, url: ORIGIN }]);
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);
			await expectLoggedOut(page);
		});
	}
}
