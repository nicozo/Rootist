// 共有の失敗・2 回目の共有・コピー表示の復帰・下書きの組み立ての細部は Vitest
// （src/routes/plan/result/page.svelte.test.ts）が担当する。
import {
	createPlanToResult,
	expect,
	mockApis,
	MOCK_SHARE_ID,
	MOCK_SUGGESTIONS,
	test
} from './helpers';

test('RS-1: 結果が無い状態で /plan/result を直接開くと /plan に戻る', async ({ page }) => {
	await mockApis(page);
	await page.goto('/plan/result');
	await expect(page).toHaveURL(/\/plan$/);
	await expect(page.getByRole('heading', { level: 1, name: '旅行プランをつくる' })).toBeVisible();
});

test('RS-2: 「同行者に共有」で共有ページの URL がクリップボードに入る', async ({
	page,
	context
}) => {
	const calls = await mockApis(page);
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await createPlanToResult(page);
	await expect(page).toHaveTitle('rootist — あなたの1日プラン');

	await page.getByRole('button', { name: '同行者に共有' }).click();
	await expect(page.getByRole('button', { name: 'リンクをコピーしました' })).toBeVisible();

	const origin = new URL(page.url()).origin;
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe(`${origin}/plan/share/${MOCK_SHARE_ID}`);
	expect(calls.plans).toBe(1);
});

test('RS-3: 「もう一度計画する」で入力が /plan に戻る', async ({ page }) => {
	await mockApis(page);
	await createPlanToResult(page);

	await page.getByRole('button', { name: 'もう一度計画する' }).click();
	await expect(page).toHaveURL(/\/plan$/);
	for (const s of MOCK_SUGGESTIONS) {
		await expect(page.getByText(s.name, { exact: true })).toBeVisible();
	}
	await expect(page.getByText('2 箇所 · 作成できます')).toBeVisible();
	await expect(page.getByRole('button', { name: '旅行プランを作成する' })).toBeEnabled();
});
