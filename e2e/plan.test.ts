// 作成の失敗・各種指定・削除などの分岐は Vitest（src/routes/plan/page.svelte.test.ts）が担当する。
import {
	createPlanToResult,
	expect,
	mockApis,
	MOCK_ROUTE_SUMMARY,
	MOCK_SUGGESTIONS,
	test
} from './helpers';

test('P-1: /plan を直接開くとタイトル・h1・空の状態が見える', async ({ page }) => {
	await mockApis(page);
	await page.goto('/plan');
	await expect(page).toHaveTitle('rootist — 旅行プランをつくる');
	await expect(page.getByRole('heading', { level: 1, name: '旅行プランをつくる' })).toBeVisible();
	await expect(page.getByText('まだ行きたい場所がありません')).toBeVisible();
});

test('P-2: 場所を 2 件選んでプランを作成すると結果画面に着く', async ({ page }) => {
	const calls = await mockApis(page);
	await createPlanToResult(page);
	await expect(page.getByText(MOCK_ROUTE_SUMMARY)).toBeVisible();
	for (const s of MOCK_SUGGESTIONS) {
		await expect(page.getByText(s.name).first()).toBeVisible();
	}
	expect(calls.route).toBe(1);
});
