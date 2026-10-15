// 範囲外: 正しい形式（UUID）の shareId での共有プランの表示と、そこからの導線。
// load が DB を直接読むためブラウザ側では差し替えられず、DB への往復も避けるため E2E では確認しない。
// 担当: src/routes/plan/share/[shareId]/page.server.test.ts（load）と page.svelte.test.ts（表示・導線）。
import { expect, test } from './helpers';

test('SH-1: UUID 形式ではない shareId は 404 になる', async ({ page }) => {
	const response = await page.goto('/plan/share/not-a-uuid');
	expect(response?.status()).toBe(404);
	await expect(page.getByText('共有されたプランが見つかりません')).toBeVisible();
});
