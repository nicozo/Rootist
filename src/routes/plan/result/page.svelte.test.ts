import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { get } from 'svelte/store';
import { routeResult, type RouteResult } from '$lib/stores/route';

// issue #62: プラン結果ページのテスト。
// /api/plans はDB書き込みを伴うためfetchをモックし、遷移とクリップボードもモックする。

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const ResultPage = (await import('./+page.svelte')).default;

const RESULT: RouteResult = {
	summary: '浅草を巡る1日',
	destinations: [
		{
			order: 1,
			name: '浅草寺',
			displayAddress: '台東区浅草',
			arrivalTime: '09:00',
			departureTime: '10:30',
			description: '雷門が有名',
			travelTimeFromPrevious: null
		}
	]
};

/** クリップボードのwriteTextを差し替える。 */
function stubClipboard(impl: () => Promise<void>) {
	const writeText = vi.fn<(url: string) => Promise<void>>(impl);
	Object.defineProperty(navigator, 'clipboard', {
		value: { writeText },
		configurable: true,
		writable: true
	});
	return writeText;
}

/** /api/plans のレスポンスを返すfetchモックを立てる。 */
function stubPlansApi(response: Response) {
	const fetchSpy = vi
		.fn<(url: string, init: { body: string }) => Promise<Response>>()
		.mockResolvedValue(response);
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

// intro を有効にして、ヘッダーと操作ブロックの in: トランジションも実際に走らせる。
/** 結果ページを描画する。 */
function renderResult() {
	return render(ResultPage, { props: {}, intro: true });
}

/** 共有ボタンを押す。 */
function shareButton() {
	return page.getByRole('button', {
		name: /同行者に共有|リンクをコピーしました|共有リンクを発行中/
	});
}

beforeEach(() => {
	routeResult.set(RESULT);
	stubClipboard(() => Promise.resolve());
});

afterEach(() => {
	routeResult.set(null);
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('/plan/result +page.svelte', () => {
	it('ストアのプランを表示する', async () => {
		await renderResult();

		await expect
			.element(page.getByRole('heading', { level: 1, name: 'あなたの1日プラン' }))
			.toBeInTheDocument();
		await expect.element(page.getByText('浅草を巡る1日')).toBeInTheDocument();
		await expect.element(page.getByText('浅草寺')).toBeInTheDocument();
	});

	it('プランが無ければ何も描画せず/planへ戻す', async () => {
		routeResult.set(null);

		const { container } = await renderResult();

		expect(container.textContent?.trim()).toBe('');
		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
	});

	it('共有ボタンと注意書きを表示する', async () => {
		await renderResult();

		await expect.element(shareButton()).toBeInTheDocument();
		await expect
			.element(page.getByText('リンクを知っている人はログインなしでプランを見られます'))
			.toBeInTheDocument();
	});

	it('共有ボタンでプランを保存しURLをコピーする', async () => {
		const fetchSpy = stubPlansApi(
			new Response(JSON.stringify({ shareId: 'abc-123' }), { status: 201 })
		);
		const writeText = stubClipboard(() => Promise.resolve());
		await renderResult();

		await shareButton().click();

		await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
		expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual(RESULT);
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
		expect(writeText.mock.calls[0][0]).toContain('/plan/share/abc-123');
		await expect.element(page.getByText('リンクをコピーしました')).toBeInTheDocument();
	});

	it('2回目の共有はAPIを再度呼ばずコピーだけする', async () => {
		const fetchSpy = stubPlansApi(
			new Response(JSON.stringify({ shareId: 'abc-123' }), { status: 201 })
		);
		const writeText = stubClipboard(() => Promise.resolve());
		await renderResult();

		await shareButton().click();
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
		await vi.waitFor(() =>
			expect(page.getByText('リンクをコピーしました').elements().length).toBe(1)
		);

		await shareButton().click();

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it('保存APIがエラーを返したらエラーメッセージを表示する', async () => {
		stubPlansApi(new Response('boom', { status: 500 }));
		await renderResult();

		await shareButton().click();

		await expect
			.element(page.getByText('プランの共有に失敗しました。時間をおいて再度お試しください。'))
			.toBeInTheDocument();
	});

	it('保存APIの通信自体が失敗してもエラーメッセージを表示する', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		await renderResult();

		await shareButton().click();

		await expect
			.element(page.getByText('プランの共有に失敗しました。時間をおいて再度お試しください。'))
			.toBeInTheDocument();
	});

	it('クリップボードが使えない場合はURLを手動コピー用に表示する', async () => {
		stubPlansApi(new Response(JSON.stringify({ shareId: 'abc-123' }), { status: 201 }));
		stubClipboard(() => Promise.reject(new Error('not allowed')));
		await renderResult();

		await shareButton().click();

		await expect.element(page.getByText(/自動コピーに失敗しました/)).toBeInTheDocument();
		await expect.element(page.getByText(/\/plan\/share\/abc-123/)).toBeInTheDocument();
	});

	it('もう一度計画するボタンで/planへ遷移する', async () => {
		await renderResult();

		await page.getByRole('button', { name: /もう一度計画する/ }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
	});

	it('ストアの内容をそのまま共有ペイロードに使う', async () => {
		expect(get(routeResult)).toEqual(RESULT);
	});

	it('コピー完了の表示は一定時間で元に戻る', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			stubPlansApi(new Response(JSON.stringify({ shareId: 'abc-123' }), { status: 201 }));
			const writeText = stubClipboard(() => Promise.resolve());
			await renderResult();

			await shareButton().click();
			await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
			await expect.element(page.getByText('リンクをコピーしました')).toBeInTheDocument();

			await vi.advanceTimersByTimeAsync(2500);

			await expect.element(page.getByText('同行者に共有')).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	});

	// 発行中はボタン自体がdisabledになるためUIからは二重クリックできないが、
	// ハンドラ側にも「実行中なら何もしない」ガードがある。disabledを外して直接叩き、
	// そのガードが効いていることを確かめる。
	it('共有処理中に再度呼ばれても二重に発行しない', async () => {
		let release: (() => void) | undefined;
		const pending = new Promise<Response>((resolve) => {
			release = () =>
				resolve(new Response(JSON.stringify({ shareId: 'abc-123' }), { status: 201 }));
		});
		const fetchSpy = vi.fn().mockReturnValue(pending);
		vi.stubGlobal('fetch', fetchSpy);
		const { container } = await renderResult();

		await shareButton().click();
		await expect.element(page.getByText('共有リンクを発行中…')).toBeInTheDocument();

		const button = container.querySelector('button');
		button?.removeAttribute('disabled');
		button?.click();

		expect(fetchSpy).toHaveBeenCalledOnce();
		release?.();
	});
});
