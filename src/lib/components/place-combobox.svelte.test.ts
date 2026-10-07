import { page } from 'vite-plus/test/browser';
import { describe, expect, it, vi, afterEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import MapPin from '@lucide/svelte/icons/map-pin';
import PlaceCombobox from './place-combobox.svelte';

// issue #62: 住所検索コンボボックスのテスト。
// /api/places はGoogle Places API（課金対象）のプロキシなので、fetchをモックして実接続しない。
// デバウンス（350ms）はフェイクタイマーだとlucideアイコンの描画が壊れるため実時間で待つ。

const DEBOUNCE_MS = 350;

const SUGGESTIONS = [
	{ placeId: 'id-1', name: '浅草寺', displayAddress: '台東区浅草' },
	{ placeId: 'id-2', name: '浅草駅', displayAddress: '台東区花川戸' }
];

/** 既定のpropsでレンダリングする。 */
function renderCombobox(onSelect: (s: unknown) => void = vi.fn()) {
	return render(PlaceCombobox, {
		id: 'place',
		label: '目的地',
		placeholder: '行き先を入力',
		icon: MapPin,
		onSelect
	});
}

/** デバウンスの発火とfetch解決を待つ。 */
function settle() {
	return new Promise((r) => setTimeout(r, DEBOUNCE_MS + 150));
}

const LOCATION = { lat: 35.7148, lng: 139.7967 };

/** /api/places（候補）と /api/places/details（座標）のレスポンスを返すfetchモックを立てる。 */
function stubPlaces(suggestions: unknown, detailsStatus = 200) {
	const fetchSpy = vi
		.fn()
		.mockImplementation(async (url: string) =>
			url === '/api/places/details'
				? new Response(JSON.stringify({ location: LOCATION }), { status: detailsStatus })
				: new Response(JSON.stringify({ suggestions }), { status: 200 })
		);
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

/** n番目のfetch呼び出しのボディ。 */
function bodyOf(fetchSpy: ReturnType<typeof vi.fn>, n: number) {
	return JSON.parse(fetchSpy.mock.calls[n][1].body);
}

/** 候補一覧が開いているか。 */
function listOpen(container: HTMLElement) {
	return container.querySelector('[data-slot="command-list"]') !== null;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('place-combobox', () => {
	it('プレースホルダを表示する', async () => {
		await renderCombobox();

		await expect.element(page.getByPlaceholder('行き先を入力')).toBeInTheDocument();
	});

	it('idを入力欄に割り当てる（label関連付け用）', async () => {
		const { container } = await renderCombobox();

		expect(container.querySelector('#place')).not.toBeNull();
	});

	it('2文字未満の入力では検索APIを呼ばない', async () => {
		const fetchSpy = stubPlaces(SUGGESTIONS);
		await renderCombobox();

		await page.getByPlaceholder('行き先を入力').fill('あ');
		await settle();

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('2文字以上入力すると検索APIを呼び候補を表示する', async () => {
		const fetchSpy = stubPlaces(SUGGESTIONS);
		await renderCombobox();

		await page.getByPlaceholder('行き先を入力').fill('浅草');
		await settle();

		expect(fetchSpy).toHaveBeenCalledOnce();
		expect(bodyOf(fetchSpy, 0)).toEqual({ query: '浅草', sessionToken: expect.any(String) });
		await expect.element(page.getByText('浅草寺')).toBeInTheDocument();
		await expect.element(page.getByText('台東区浅草')).toBeInTheDocument();
	});

	it('連続入力は最後の1回だけ検索する（デバウンス）', async () => {
		const fetchSpy = stubPlaces(SUGGESTIONS);
		await renderCombobox();

		const input = page.getByPlaceholder('行き先を入力');
		await input.fill('浅');
		await input.fill('浅草');
		await input.fill('浅草寺');
		await settle();

		expect(fetchSpy).toHaveBeenCalledOnce();
		expect(bodyOf(fetchSpy, 0)).toMatchObject({ query: '浅草寺' });
	});

	it('候補が0件なら一覧を開かない', async () => {
		stubPlaces([]);
		const { container } = await renderCombobox();

		await page.getByPlaceholder('行き先を入力').fill('存在しない場所');
		await settle();

		expect(listOpen(container)).toBe(false);
	});

	it('候補を選ぶと座標を取得してonSelectへ渡し入力欄を空にする', async () => {
		const fetchSpy = stubPlaces(SUGGESTIONS);
		const onSelect = vi.fn();
		await renderCombobox(onSelect);

		await page.getByPlaceholder('行き先を入力').fill('浅草');
		await settle();
		await page.getByText('浅草寺').click();

		await vi.waitFor(() =>
			expect(onSelect).toHaveBeenCalledWith({ ...SUGGESTIONS[0], location: LOCATION })
		);
		await expect.element(page.getByPlaceholder('行き先を入力')).toHaveValue('');
		// issue #149: 候補検索と座標取得は同じセッショントークンで呼ぶ（Autocomplete を無料にするため）
		expect(fetchSpy.mock.calls[1][0]).toBe('/api/places/details');
		expect(bodyOf(fetchSpy, 1)).toEqual({
			placeId: 'id-1',
			sessionToken: bodyOf(fetchSpy, 0).sessionToken
		});
	});

	it('1件選んだら次の検索は新しいセッショントークンで行う', async () => {
		const fetchSpy = stubPlaces(SUGGESTIONS);
		await renderCombobox();

		const input = page.getByPlaceholder('行き先を入力');
		await input.fill('浅草');
		await settle();
		await page.getByText('浅草寺').click();
		await expect.element(input).toHaveValue('');
		await input.fill('上野');
		await settle();

		expect(bodyOf(fetchSpy, 2).sessionToken).not.toBe(bodyOf(fetchSpy, 0).sessionToken);
	});

	it('座標の取得に失敗したらonSelectを呼ばずエラーを表示する', async () => {
		stubPlaces(SUGGESTIONS, 502);
		const onSelect = vi.fn();
		await renderCombobox(onSelect);

		await page.getByPlaceholder('行き先を入力').fill('浅草');
		await settle();
		await page.getByText('浅草寺').click();

		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent(/位置情報を取得できませんでした/);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('検索APIが失敗しても候補を出さず落ちない', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		const { container } = await renderCombobox();

		await page.getByPlaceholder('行き先を入力').fill('浅草');
		await settle();

		expect(listOpen(container)).toBe(false);
		await expect.element(page.getByPlaceholder('行き先を入力')).toBeInTheDocument();
	});

	it('Escapeキーで候補一覧を閉じる', async () => {
		stubPlaces(SUGGESTIONS);
		const { container } = await renderCombobox();

		const input = page.getByPlaceholder('行き先を入力');
		await input.fill('浅草');
		await settle();
		expect(listOpen(container)).toBe(true);

		await input.click();
		await page
			.getByPlaceholder('行き先を入力')
			.element()
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		await vi.waitFor(() => expect(listOpen(container)).toBe(false));
	});

	it('入力欄からフォーカスが外れると候補一覧を閉じる', async () => {
		stubPlaces(SUGGESTIONS);
		const { container } = await renderCombobox();

		const input = page.getByPlaceholder('行き先を入力');
		await input.fill('浅草');
		await settle();
		expect(listOpen(container)).toBe(true);

		input.element().dispatchEvent(new FocusEvent('blur', { bubbles: true }));

		await vi.waitFor(() => expect(listOpen(container)).toBe(false));
	});
});
