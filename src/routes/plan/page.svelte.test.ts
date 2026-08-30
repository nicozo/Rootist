import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { get } from 'svelte/store';
import { routeResult, planDraft, type PlanDraft } from '$lib/stores/route';

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

/** 滞在時間セレクトのトリガー要素をindex番目（複数の行きたい場所がある場合に区別するため）取得する。 */
function stayMinutesTrigger(index = 0) {
	return document.querySelectorAll('[aria-label="滞在時間"]')[index] as HTMLElement | undefined;
}

/**
 * index番目の行きたい場所の滞在時間セレクトを開き、プリセットを選ぶ（bits-uiのSelect）。
 * bits-uiのトリガーはpointerイベントで開くため、DOM要素への素の.click()ではなくPlaywright経由の
 * クリック（page.getByLabelText().nth().click()）を使う必要がある。
 */
async function pickStayMinutes(label: string, index = 0) {
	await page.getByLabelText('滞在時間').nth(index).click();
	await page.getByRole('option', { name: label, exact: true }).click();
}

/** index番目の行きたい場所の訪問時刻セレクト（時）を開き、選択肢を選ぶ（issue #70）。 */
async function pickArriveAtHour(label: string, index = 0) {
	await page.getByLabelText('訪問時刻の時').nth(index).click();
	await page.getByRole('option', { name: label, exact: true }).click();
}

/** 訪問時刻セレクト（時）のトリガー要素をindex番目取得する。 */
function arriveAtTrigger(index = 0) {
	return document.querySelectorAll('[aria-label="訪問時刻の時"]')[index] as HTMLElement | undefined;
}

beforeEach(() => {
	routeResult.set(null);
	planDraft.set(null);
	stubApis();
});

afterEach(() => {
	routeResult.set(null);
	planDraft.set(null);
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

	it('1件以上あると時間帯・訪問時刻・滞在時間の案内を表示する', async () => {
		await renderPlan();

		await addLocation('東京タワー');

		await expect
			.element(page.getByText(/各スポットの訪問時間帯・訪問時刻・滞在時間はいずれも任意です/))
			.toBeInTheDocument();
	});

	it('行き先を追加すると滞在時間セレクトを「指定なし」で表示する', async () => {
		await renderPlan();

		await addLocation('東京タワー');

		await expect.element(page.getByLabelText('滞在時間')).toBeInTheDocument();
		expect(stayMinutesTrigger()?.textContent?.trim()).toBe('指定なし');
	});

	it('行き先を追加すると訪問時刻セレクトを未指定（--）で表示する', async () => {
		await renderPlan();

		await addLocation('東京タワー');

		await expect.element(page.getByLabelText('訪問時刻の時')).toBeInTheDocument();
		await expect.element(page.getByLabelText('訪問時刻の分')).toBeInTheDocument();
		expect(arriveAtTrigger()?.textContent?.trim()).toBe('--');
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

		toggleItem('移動手段', '公共交通機関')?.click();
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

	it('目的地の滞在時間を選ぶとリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await pickStayMinutes('1時間30分');
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).locations[0].stayMinutes).toBe(90);
	});

	it('滞在時間を一度選んでから「指定なし」に戻すとリクエストから外れる', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await pickStayMinutes('1時間30分');
		await pickStayMinutes('指定なし');
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).locations[0].stayMinutes).toBeUndefined();
	});

	it('時間帯と滞在時間を同じ行き先に両方指定するとどちらもリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		toggleItem('訪問する時間帯', '朝')?.click();
		await pickStayMinutes('30分');
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		const location = JSON.parse(routeCall![1].body).locations[0];
		expect(location.timeSlot).toBe('morning');
		expect(location.stayMinutes).toBe(30);
	});

	it('目的地の訪問時刻を選ぶとリクエストに含める', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await pickArriveAtHour('10');
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).locations[0].arriveAt).toBe('10:00');
	});

	it('訪問時刻を一度選んでから「指定なし」に戻すとリクエストから外れる', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await pickArriveAtHour('10');
		await pickArriveAtHour('指定なし');
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		expect(JSON.parse(routeCall![1].body).locations[0].arriveAt).toBeUndefined();
	});

	it('訪問時刻を指定すると同じ行き先の時間帯指定は解除される', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		toggleItem('訪問する時間帯', '朝')?.click();
		await pickArriveAtHour('10');
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(toggleItem('訪問する時間帯', '朝')?.getAttribute('data-state')).toBe('off');
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		const location = JSON.parse(routeCall![1].body).locations[0];
		expect(location.arriveAt).toBe('10:00');
		expect(location.timeSlot).toBeUndefined();
	});

	it('時間帯を指定すると同じ行き先の訪問時刻は解除される', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await pickArriveAtHour('10');
		toggleItem('訪問する時間帯', '朝')?.click();
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(arriveAtTrigger(0)?.textContent?.trim()).toBe('--');
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		const location = JSON.parse(routeCall![1].body).locations[0];
		expect(location.timeSlot).toBe('morning');
		expect(location.arriveAt).toBeUndefined();
	});

	it('訪問時刻と滞在時間は同じ行き先に両方指定できる', async () => {
		const fetchSpy = stubApis();
		await renderPlan();
		await addLocation('東京タワー');
		await addLocation('浅草寺');

		await pickArriveAtHour('10');
		await pickStayMinutes('30分');
		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		const location = JSON.parse(routeCall![1].body).locations[0];
		expect(location.arriveAt).toBe('10:00');
		expect(location.stayMinutes).toBe(30);
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
			{
				name: '東京タワー',
				displayAddress: '港区芝公園',
				timeSlot: undefined,
				stayMinutes: undefined
			},
			{ name: '浅草寺', displayAddress: '台東区浅草', timeSlot: undefined, stayMinutes: undefined }
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
		expect(body.locations[0].timeSlot).toBeUndefined();
		expect(body.locations[0].stayMinutes).toBeUndefined();
		expect(body.locations[0].arriveAt).toBeUndefined();
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

// issue #64: 「もう一度計画する」経由でのみ入力を復元する挙動のテスト。
describe('/plan +page.svelte 入力の復元（もう一度計画する）', () => {
	const DRAFT: PlanDraft = {
		origin: { name: '東京駅', displayAddress: '千代田区丸の内' },
		transportMode: 'transit',
		startTime: '09:30',
		endDestination: { name: '新宿グランドホテル', displayAddress: '新宿区西新宿' },
		locations: [
			{
				address: '浅草寺',
				displayAddress: '台東区浅草',
				timeSlot: 'morning',
				stayMinutes: 90,
				arriveAt: ''
			},
			{
				address: '東京タワー',
				displayAddress: '港区芝公園',
				timeSlot: '',
				stayMinutes: '',
				arriveAt: '13:00'
			}
		]
	};

	it('draftがあれば出発地・出発時刻・移動手段・行きたい場所・ゴールを復元表示する', async () => {
		planDraft.set(DRAFT);

		const { container } = await renderPlan();

		await expect.element(page.getByText('東京駅')).toBeInTheDocument();
		await expect.element(page.getByText('千代田区丸の内')).toBeInTheDocument();
		await expect.element(page.getByText('新宿グランドホテル')).toBeInTheDocument();
		await expect.element(page.getByText('浅草寺')).toBeInTheDocument();
		await expect.element(page.getByText('東京タワー')).toBeInTheDocument();
		expect(container.textContent).toContain('2 箇所 · 作成できます');
		expect(
			(page.getByLabelText('時', { exact: true }).element() as HTMLElement).textContent?.trim()
		).toBe('09');
		expect(toggleItem('移動手段', '公共交通機関')?.getAttribute('data-state')).toBe('on');
		expect(toggleItem('訪問する時間帯', '朝')?.getAttribute('data-state')).toBe('on');
		expect(stayMinutesTrigger(0)?.textContent?.trim()).toBe('1時間30分');
		expect(stayMinutesTrigger(1)?.textContent?.trim()).toBe('指定なし');
		expect(arriveAtTrigger(0)?.textContent?.trim()).toBe('--');
		expect(arriveAtTrigger(1)?.textContent?.trim()).toBe('13');
	});

	it('復元後、行きたい場所の追加・削除ができる', async () => {
		planDraft.set(DRAFT);
		const { container } = await renderPlan();

		await addLocation('浅草寺');
		await expect.element(page.getByText(/3 箇所/)).toBeInTheDocument();

		const removeButtons = container.querySelectorAll('button:has(svg.lucide-trash-2)');
		(removeButtons[0] as HTMLElement | undefined)?.click();

		await vi.waitFor(() => expect(container.textContent).toContain('2 箇所'));
	});

	it('復元後にそのまま作成すると復元された内容で/api/routeを呼ぶ', async () => {
		const fetchSpy = stubApis();
		planDraft.set(DRAFT);
		await renderPlan();

		await generateButton().click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		const routeCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('/api/route'));
		const body = JSON.parse(routeCall![1].body);
		expect(body.origin).toEqual(DRAFT.origin);
		expect(body.transportMode).toBe('transit');
		expect(body.startTime).toBe('09:30');
		expect(body.endDestination).toEqual(DRAFT.endDestination);
		expect(body.locations).toEqual([
			{
				name: '浅草寺',
				displayAddress: '台東区浅草',
				timeSlot: 'morning',
				stayMinutes: 90,
				arriveAt: undefined
			},
			{
				name: '東京タワー',
				displayAddress: '港区芝公園',
				timeSlot: undefined,
				stayMinutes: undefined,
				arriveAt: '13:00'
			}
		]);
	});

	it('復元された行きたい場所には一意なidが振られる（キー重複・欠落なし）', async () => {
		planDraft.set(DRAFT);
		const { container } = await renderPlan();

		// 行きたい場所リストの ItemGroup（class="gap-3"）配下に、件数分だけ item が重複・欠落なく描画される。
		const items = container.querySelectorAll('[data-slot="item-group"].gap-3 [data-slot="item"]');
		expect(items.length).toBe(DRAFT.locations.length);
		expect([...items].map((el) => el.textContent)).toEqual([
			expect.stringContaining('浅草寺'),
			expect.stringContaining('東京タワー')
		]);
	});

	it('draftは1回読み取ると消費され、ストアはnullに戻る', async () => {
		planDraft.set(DRAFT);

		await renderPlan();

		expect(get(planDraft)).toBeNull();
	});

	it('draftを消費した後に再度render()しても2回目は空欄で始まる', async () => {
		planDraft.set(DRAFT);
		await renderPlan();
		expect(get(planDraft)).toBeNull();

		const { container } = await renderPlan();

		expect(container.textContent).toContain('まだ行きたい場所がありません');
		expect(container.textContent).toContain('0 箇所');
	});

	it('draftがnullのまま開始すると従来通り空欄で始まる（デグレ確認）', async () => {
		const { container } = await renderPlan();

		expect(container.textContent).toContain('まだ行きたい場所がありません');
		expect(container.textContent).toContain('0 箇所');
		await expect
			.element(page.getByPlaceholder('例：自宅最寄り駅、宿泊ホテル...'))
			.toBeInTheDocument();
	});
});
