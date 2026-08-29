import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { get } from 'svelte/store';
import { routeResult } from '$lib/stores/route';

// issue #62: プラン作成ページのテスト。
// /api/places（Google Places）と /api/route（Gemini）は課金対象なのでfetchをモックし実接続しない。

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const PlanPage = (await import('./+page.svelte')).default;

const DEBOUNCE_MS = 350;

const PLACES = [
	{ placeId: 'p1', name: '東京タワー', displayAddress: '港区芝公園' },
	{ placeId: 'p2', name: '浅草寺', displayAddress: '台東区浅草' }
];

/** /api/places と /api/route の両方に応答するfetchモックを立てる。 */
function stubApis(routeResponse?: Response) {
	const fetchSpy = vi
		.fn<(url: string, init: { body: string }) => Promise<Response>>()
		.mockImplementation((url) => {
			if (String(url).includes('/api/places')) {
				return Promise.resolve(
					new Response(JSON.stringify({ suggestions: PLACES }), { status: 200 })
				);
			}
			return Promise.resolve(
				routeResponse ??
					new Response(JSON.stringify({ destinations: [], summary: '概要' }), { status: 200 })
			);
		});
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

/** デバウンスとfetch解決を待つ。 */
function settle() {
	return new Promise((r) => setTimeout(r, DEBOUNCE_MS + 150));
}

/**
 * 開いている候補リストの中から指定の候補をクリックする。
 * 追加済みの一覧にも同じ地名が並ぶため、候補リスト内に絞り込む必要がある。
 */
async function clickSuggestion(name: string) {
	const item = await vi.waitFor(() => {
		const found = [
			...document.querySelectorAll('[data-slot="command-list"] [data-slot="command-item"]')
		].find((el) => el.textContent?.includes(name));
		if (!found) throw new Error(`候補「${name}」が見つかりません`);
		return found as HTMLElement;
	});
	item.click();
}

/** 指定の入力欄で検索して候補を選ぶ。 */
async function pickPlace(placeholder: string, query: string, name: string) {
	await page.getByPlaceholder(placeholder).fill(query);
	await settle();
	await clickSuggestion(name);
}

/** 「行きたい場所」を1件追加する。 */
async function addLocation(name: string) {
	await pickPlace('例：東京タワー、浅草寺...', name, name);
}

// intro を有効にして、目的地カードの in: トランジションも実際に走らせる。
/** プラン作成ページを描画する。 */
function renderPlan() {
	return render(PlanPage, { props: {}, intro: true });
}

/** 作成ボタン。 */
function generateButton() {
	return page.getByRole('button', { name: /旅行プランを作成する|作成中/ });
}

/** トグルグループ（ToggleGroup）内の項目をaria-labelで引く。ロールはbits-uiの実装依存なのでDOMから直接探す。 */
function toggleItem(groupLabel: string, itemLabel: string) {
	const group = document.querySelector(`[aria-label="${groupLabel}"]`);
	return [...(group?.querySelectorAll('[aria-label]') ?? [])].find(
		(el) => el.getAttribute('aria-label') === itemLabel
	) as HTMLElement | undefined;
}

beforeEach(() => {
	routeResult.set(null);
	stubApis();
});

afterEach(() => {
	routeResult.set(null);
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('/plan +page.svelte 初期表示', () => {
	it('見出しを表示する', async () => {
		await renderPlan();

		await expect
			.element(page.getByRole('heading', { level: 1, name: '旅行プランをつくる' }))
			.toBeInTheDocument();
	});

	it('行きたい場所が0件なら空状態を表示する', async () => {
		await renderPlan();

		await expect.element(page.getByText('まだ行きたい場所がありません')).toBeInTheDocument();
	});

	it('0件のときは件数バッジに0を出す', async () => {
		const { container } = await renderPlan();

		expect(container.textContent).toContain('0 箇所');
	});

	it('2件足りない旨の案内を表示する', async () => {
		await renderPlan();

		await expect.element(page.getByText(/あと 2 件追加すると/)).toBeInTheDocument();
	});

	it('作成ボタンを無効にする', async () => {
		await renderPlan();

		await expect.element(generateButton()).toBeDisabled();
	});

	it('出発地・移動手段・出発時刻の入力欄を表示する', async () => {
		await renderPlan();

		await expect
			.element(page.getByPlaceholder('例：自宅最寄り駅、宿泊ホテル...'))
			.toBeInTheDocument();
		await expect.element(page.getByLabelText('移動手段')).toBeInTheDocument();
		await expect.element(page.getByText('出発時刻')).toBeInTheDocument();
	});

	it('ゴールは折りたたんだ状態で始まる', async () => {
		await renderPlan();

		await expect
			.element(page.getByRole('button', { name: /最後に向かう場所を指定/ }))
			.toBeInTheDocument();
		await expect
			.element(page.getByPlaceholder('例：新宿グランドホテル...'))
			.not.toBeInTheDocument();
	});
});

describe('/plan +page.svelte 行きたい場所の追加と削除', () => {
	it('候補を選ぶとリストに追加し空状態を消す', async () => {
		await renderPlan();

		await addLocation('東京タワー');

		await expect.element(page.getByText('まだ行きたい場所がありません')).not.toBeInTheDocument();
		await expect.element(page.getByText('港区芝公園')).toBeInTheDocument();
	});

	it('1件追加すると残り1件の案内になる', async () => {
		await renderPlan();

		await addLocation('東京タワー');

		await expect.element(page.getByText(/あと 1 件追加すると/)).toBeInTheDocument();
	});

	it('2件追加すると作成可能バッジを出し案内を消す', async () => {
		const { container } = await renderPlan();

		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await expect.element(page.getByText(/2 箇所 · 作成できます/)).toBeInTheDocument();
		expect(container.textContent).not.toContain('件追加すると');
	});

	it('2件追加すると作成ボタンが有効になる', async () => {
		await renderPlan();

		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await expect.element(generateButton()).toBeEnabled();
	});

	it('1件以上あると時間帯の案内を表示する', async () => {
		await renderPlan();

		await addLocation('東京タワー');

		await expect.element(page.getByText(/各スポットの訪問時間帯は任意です/)).toBeInTheDocument();
	});

	it('削除ボタンでリストから取り除く', async () => {
		const { container } = await renderPlan();

		await addLocation('東京タワー');
		await expect.element(page.getByText('港区芝公園')).toBeInTheDocument();

		const removeButtons = container.querySelectorAll('button[aria-label^="削除"]');
		const target = removeButtons[0] ?? container.querySelector('button:has(svg.lucide-trash-2)');
		(target as HTMLElement | null)?.click();

		await vi.waitFor(() => expect(container.textContent).toContain('まだ行きたい場所がありません'));
	});
});

describe('/plan +page.svelte 出発地とゴール', () => {
	it('出発地を選ぶと表示し解除できる', async () => {
		const { container } = await renderPlan();

		await pickPlace('例：自宅最寄り駅、宿泊ホテル...', '東京', '東京タワー');

		await expect
			.element(page.getByRole('button', { name: '出発地の選択を解除' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: '出発地の選択を解除' }).click();

		await vi.waitFor(() =>
			expect(
				container.querySelector('input[placeholder="例：自宅最寄り駅、宿泊ホテル..."]')
			).not.toBeNull()
		);
	});

	it('ゴールを開いてキャンセルすると閉じる', async () => {
		await renderPlan();

		await page.getByRole('button', { name: /最後に向かう場所を指定/ }).click();
		await expect.element(page.getByPlaceholder('例：新宿グランドホテル...')).toBeInTheDocument();

		await page.getByRole('button', { name: 'キャンセル' }).click();

		await expect
			.element(page.getByPlaceholder('例：新宿グランドホテル...'))
			.not.toBeInTheDocument();
	});

	it('ゴールを選ぶと表示し解除できる', async () => {
		await renderPlan();

		await page.getByRole('button', { name: /最後に向かう場所を指定/ }).click();
		await pickPlace('例：新宿グランドホテル...', '浅草', '浅草寺');

		await expect
			.element(page.getByRole('button', { name: 'ゴールの選択を解除' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'ゴールの選択を解除' }).click();

		await expect
			.element(page.getByRole('button', { name: /最後に向かう場所を指定/ }))
			.toBeInTheDocument();
	});
});

describe('/plan +page.svelte 任意条件の指定', () => {
	it('移動手段を選ぶとリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		toggleItem('移動手段', '電車・公共交通')?.click();
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).transportMode).toBe('transit');
	});

	it('出発時刻を選ぶとリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await page.getByLabelText('時', { exact: true }).click();
		await page.getByRole('option', { name: '10' }).click();
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).startTime).toBe('10:00');
	});

	it('目的地の時間帯を選ぶとリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		toggleItem('訪問する時間帯', '朝')?.click();
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).locations[0].timeSlot).toBe('morning');
	});

	it('出発地を選ぶとリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await pickPlace('例：自宅最寄り駅、宿泊ホテル...', '東京', '東京タワー');
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).origin).toEqual({
			name: '東京タワー',
			displayAddress: '港区芝公園'
		});
	});

	it('ゴールを選ぶとリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');
		await page.getByRole('button', { name: /最後に向かう場所を指定/ }).click();
		await pickPlace('例：新宿グランドホテル...', '浅草', '浅草寺');

		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).endDestination).toEqual({
			name: '浅草寺',
			displayAddress: '台東区浅草'
		});
	});
});

describe('/plan +page.svelte プラン作成', () => {
	/** 作成できる状態（2件追加済み）にする。 */
	async function ready() {
		const rendered = await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');
		return rendered;
	}

	it('入力内容を /api/route へ送りストアに保存して遷移する', async () => {
		const fetchSpy = stubApis(
			new Response(JSON.stringify({ destinations: [], summary: '生成された概要' }), { status: 200 })
		);
		await ready();

		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(routeCall).toBeDefined();
		expect(JSON.parse(routeCall![1].body).locations).toEqual([
			{ name: '東京タワー', displayAddress: '港区芝公園', timeSlot: undefined },
			{ name: '浅草寺', displayAddress: '台東区浅草', timeSlot: undefined }
		]);
		expect(get(routeResult)).toEqual({ destinations: [], summary: '生成された概要' });
	});

	it('未指定の条件はリクエストに含めない', async () => {
		const fetchSpy = stubApis();
		await ready();

		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		const body = JSON.parse(routeCall![1].body);
		expect(body.origin).toBeUndefined();
		expect(body.transportMode).toBeUndefined();
		expect(body.startTime).toBeUndefined();
		expect(body.endDestination).toBeUndefined();
	});

	it('生成APIがエラーを返したらメッセージを表示し遷移しない', async () => {
		stubApis(new Response('boom', { status: 502 }));
		await ready();

		await generateButton().click();

		await expect
			.element(page.getByText('プランの作成に失敗しました。もう一度お試しください。'))
			.toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('通信自体が失敗したら通信エラーを表示する', async () => {
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

		await generateButton().click();

		await expect
			.element(page.getByText('通信エラーが発生しました。もう一度お試しください。'))
			.toBeInTheDocument();
	});
});
