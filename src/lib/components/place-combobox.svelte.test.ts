import { page } from 'vitest/browser';
import { describe, expect, it, vi, afterEach } from 'vitest';
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

/** /api/places のレスポンスを返すfetchモックを立てる。 */
function stubPlaces(suggestions: unknown) {
	const fetchSpy = vi
		.fn()
		.mockResolvedValue(new Response(JSON.stringify({ suggestions }), { status: 200 }));
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
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
		expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ query: '浅草' });
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
		expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ query: '浅草寺' });
	});

	it('候補が0件なら一覧を開かない', async () => {
		stubPlaces([]);
		const { container } = await renderCombobox();

		await page.getByPlaceholder('行き先を入力').fill('存在しない場所');
		await settle();

		expect(listOpen(container)).toBe(false);
	});

	it('候補を選ぶとonSelectへ渡し入力欄を空にする', async () => {
		stubPlaces(SUGGESTIONS);
		const onSelect = vi.fn();
		await renderCombobox(onSelect);

		await page.getByPlaceholder('行き先を入力').fill('浅草');
		await settle();
		await page.getByText('浅草寺').click();

		expect(onSelect).toHaveBeenCalledWith(SUGGESTIONS[0]);
		await expect.element(page.getByPlaceholder('行き先を入力')).toHaveValue('');
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
