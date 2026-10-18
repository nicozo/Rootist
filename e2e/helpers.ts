// E2E の共通処理（テストではないので *.test.ts にしない）。
// 観点と方針の正は .claude/rules/testing.md。
import { expect, test as base, type Page } from '@playwright/test';

/** モックの応答。アプリの remote function が実際に返す形にそろえる（RouteResult は src/lib/stores/route.ts）。 */
export const MOCK_SUGGESTIONS = [
	{ placeId: 'mock-place-1', name: '東京タワー', displayAddress: '東京都港区芝公園4-2-8' },
	{ placeId: 'mock-place-2', name: '浅草寺', displayAddress: '東京都台東区浅草2-3-1' }
];

export const MOCK_ROUTE_SUMMARY = 'モックの概要: 2 か所を巡る1日プランです。';

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
		description: `${i + 1} か所目の見どころです。`,
		travelTimeFromPrevious: i === 0 ? null : '約30分'
	}))
};

export const MOCK_SHARE_ID = '123e4567-e89b-42d3-a456-426614174000';

export interface ApiCalls {
	/** モックした各 remote function が受けたリクエスト数 */
	places: number;
	route: number;
	plans: number;
}

/** remote function の内部 URL（`/_app/remote/<hash>/<関数名>`）の接頭辞。 */
const REMOTE_PATH = '/_app/remote/';

/**
 * 全テストで有効な安全網。モックしていない remote function への要求（`/_app/remote/**`）は打ち切り、記録する。
 * テスト終了時に記録が残っていれば `unmocked remote function request: <METHOD> <path>` で失敗させる。
 * 手元の実 .env には課金対象の API キーと共有 DB があるので、漏れてもサーバーには届かせない。
 * 個別のモックは後から登録される（Playwright は後に登録したルートを優先する）。
 * 旧 `/api/*` への要求は、アプリがもう発行しない（旧エンドポイントは 404）ため監視しない。
 */
export const test = base.extend<{ unmockedRemoteGuard: void }>({
	unmockedRemoteGuard: [
		async ({ page }, use) => {
			const unmocked: string[] = [];
			await page.route(`**${REMOTE_PATH}**`, (route) => {
				const request = route.request();
				unmocked.push(`${request.method()} ${new URL(request.url()).pathname}`);
				return route.abort();
			});
			await use();
			if (unmocked.length > 0) {
				throw new Error(`unmocked remote function request: ${unmocked.join(', ')}`);
			}
		},
		{ auto: true }
	]
});

export { expect };

/**
 * devalue.stringify 相当（remote function の応答 `data` の形式）。モックの応答を作るためだけに使う。
 * `devalue` は直接の依存ではないため、JSON で表せる値に限って最小限を自前で組む。
 * 形式: スロットの配列。0 番目がルートで、オブジェクト・配列は子のスロット番号を持ち、
 * undefined は -1。
 */
function devalueStringify(value: unknown): string {
	const slots: unknown[] = [];
	const add = (v: unknown): number => {
		if (v === undefined) return -1;
		const index = slots.length;
		slots.push(null);
		if (Array.isArray(v)) {
			slots[index] = v.map(add);
		} else if (v !== null && typeof v === 'object') {
			const obj: Record<string, number> = {};
			for (const [k, child] of Object.entries(v)) obj[k] = add(child);
			slots[index] = obj;
		} else {
			slots[index] = v;
		}
		return index;
	};
	add(value);
	return JSON.stringify(slots);
}

/** remote function（command）の成功応答。kit の実際の形式: `{ type: 'result', data: devalue({ _: 戻り値 }) }`。 */
function remoteResult(returnValue: unknown) {
	return { type: 'result', data: devalueStringify({ _: returnValue }) };
}

/** 場所検索・ルート生成・プラン保存の remote function をモックする。呼び出し回数は戻り値で確認する。 */
export async function mockApis(page: Page): Promise<ApiCalls> {
	const calls: ApiCalls = { places: 0, route: 0, plans: 0 };
	await page.route(`**${REMOTE_PATH}*/searchPlaces`, (route) => {
		calls.places += 1;
		return route.fulfill({ status: 200, json: remoteResult({ suggestions: MOCK_SUGGESTIONS }) });
	});
	await page.route(`**${REMOTE_PATH}*/generateRoute`, (route) => {
		calls.route += 1;
		return route.fulfill({ status: 200, json: remoteResult(MOCK_ROUTE_RESULT) });
	});
	await page.route(`**${REMOTE_PATH}*/savePlan`, (route) => {
		calls.plans += 1;
		return route.fulfill({ status: 200, json: remoteResult({ shareId: MOCK_SHARE_ID }) });
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
	// 一覧（ItemTitle）に選んだ場所名がそのまま並ぶこと（候補の option は選択後に閉じる）
	for (const s of MOCK_SUGGESTIONS)
		await expect(page.getByText(s.name, { exact: true })).toBeVisible();
	await expect(page.getByText('2 箇所 · 作成できます')).toBeVisible();
	await page.getByRole('button', { name: '旅行プランを作成する' }).click();
	await expect(page).toHaveURL(/\/plan\/result$/);
	await expect(page.getByRole('heading', { level: 1, name: 'あなたの1日プラン' })).toBeVisible();
}
