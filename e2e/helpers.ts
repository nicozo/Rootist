// E2E の共通処理（テストではないので *.test.ts にしない）。
// 観点と方針の正は .claude/rules/testing.md。
import { expect, test as base, type Page } from '@playwright/test';

/** モックの応答。アプリの API が実際に返す形にそろえる（RouteResult は src/lib/stores/route.ts）。 */
export const MOCK_SUGGESTIONS = [
	{ placeId: 'mock-place-1', name: '東京タワー', displayAddress: '東京都港区芝公園4-2-8' },
	{ placeId: 'mock-place-2', name: '浅草寺', displayAddress: '東京都台東区浅草2-3-1' }
];

export const MOCK_ROUTE_SUMMARY = 'モックの概要: 東京タワーから浅草寺へ向かう1日プランです。';

export const MOCK_ROUTE_RESULT = {
	summary: MOCK_ROUTE_SUMMARY,
	origin: null,
	transportMode: null,
	startTime: null,
	endDestination: null,
	planDate: null,
	destinations: MOCK_SUGGESTIONS.map((s, i) => ({
		order: i + 1,
		name: s.name,
		displayAddress: s.displayAddress,
		arrivalTime: i === 0 ? '10:00' : '12:00',
		departureTime: i === 0 ? '11:00' : '13:00',
		description: `${s.name}を観光します。`,
		travelTimeFromPrevious: i === 0 ? null : '約30分'
	}))
};

export const MOCK_SHARE_ID = '123e4567-e89b-42d3-a456-426614174000';

export interface ApiCalls {
	/** モックした各 API が受けたリクエスト数 */
	places: number;
	route: number;
	plans: number;
}

/**
 * 全テストで有効な安全網。モックしていない `/api/*` は打ち切り、記録する。
 * テスト終了時に記録が残っていれば `unmocked API request: <METHOD> <path>` で失敗させる。
 * 手元の実 .env には課金対象の API キーがあるので、漏れてもサーバーには届かせない。
 * 個別のモックは後から登録される（Playwright は後に登録したルートを優先する）。
 */
export const test = base.extend<{ unmockedApiGuard: void }>({
	unmockedApiGuard: [
		async ({ page }, use) => {
			const unmocked: string[] = [];
			await page.route('**/api/**', (route) => {
				const request = route.request();
				unmocked.push(`${request.method()} ${new URL(request.url()).pathname}`);
				return route.abort();
			});
			await use();
			if (unmocked.length > 0) {
				throw new Error(`unmocked API request: ${unmocked.join(', ')}`);
			}
		},
		{ auto: true }
	]
});

export { expect };

/** `/api/places`・`/api/route`・`/api/plans` をモックする。呼び出し回数は戻り値で確認する。 */
export async function mockApis(page: Page): Promise<ApiCalls> {
	const calls: ApiCalls = { places: 0, route: 0, plans: 0 };
	await page.route('**/api/places', (route) => {
		calls.places += 1;
		return route.fulfill({ status: 200, json: { suggestions: MOCK_SUGGESTIONS } });
	});
	await page.route('**/api/route', (route) => {
		calls.route += 1;
		return route.fulfill({ status: 200, json: MOCK_ROUTE_RESULT });
	});
	await page.route('**/api/plans', (route) => {
		calls.plans += 1;
		return route.fulfill({ status: 201, json: { shareId: MOCK_SHARE_ID } });
	});
	return calls;
}

/** 未ログインの目印（ナビに「ログイン」「新規登録」があり、アカウントメニューが無い）。 */
export async function expectLoggedOut(page: Page) {
	await expect(page.getByRole('link', { name: 'ログイン', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: '新規登録', exact: true })).toBeVisible();
	await expect(page.getByLabel('アカウントメニュー')).toHaveCount(0);
}

/**
 * SvelteKit の hydration 完了を待つ。完了前は JS の onsubmit・oninput が効かない。
 * hydration の完了を示す目印が無いため、ここ 1 か所だけ固定時間を使う。
 */
export async function waitForHydration(page: Page) {
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(500);
}

/** `/plan` の場所の欄に入力して、候補から name の場所を選ぶ。 */
export async function addPlace(page: Page, name: string) {
	await page.getByPlaceholder('例：東京タワー、浅草寺...').fill('東京');
	await page.getByRole('option', { name: new RegExp(name) }).click();
}

/** `/plan` を開き、2 件の場所を選んで「旅行プランを作成する」を押し、結果画面まで進める。 */
export async function createPlanToResult(page: Page) {
	await page.goto('/plan');
	await waitForHydration(page);
	for (const s of MOCK_SUGGESTIONS) await addPlace(page, s.name);
	await expect(page.getByText('2 箇所 · 作成できます')).toBeVisible();
	await page.getByRole('button', { name: '旅行プランを作成する' }).click();
	await expect(page).toHaveURL(/\/plan\/result$/);
	await expect(page.getByRole('heading', { level: 1, name: 'あなたの1日プラン' })).toBeVisible();
}
