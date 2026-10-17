import { page } from 'vite-plus/test/browser';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { get } from 'svelte/store';
import { error } from '@sveltejs/kit';
import { routeResult, planDraft, type RouteResult } from '#lib/stores/route.js';

// issue #62: プラン結果ページのテスト。
// プラン保存（remote function）はDB書き込みを伴うため remote module をモックし、遷移とクリップボードもモックする（issue #159）。

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const { savePlan } = vi.hoisted(() => ({ savePlan: vi.fn() }));
vi.mock('#lib/remote/plans.remote.js', () => ({ savePlan }));

/** サーバーが失敗を返したときに remote function が投げる本物の HttpError を作る。 */
function httpError(status: number) {
	try {
		error(status, 'failed');
	} catch (e) {
		return e;
	}
}

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

/** プラン保存の remote function が shareId を返すモックを立てる。 */
function stubSavePlan(shareId = 'abc-123') {
	savePlan.mockResolvedValue({ shareId });
	return savePlan;
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
	planDraft.set(null);
	stubClipboard(() => Promise.resolve());
});

afterEach(() => {
	routeResult.set(null);
	planDraft.set(null);
	vi.clearAllMocks();
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
		const savePlanSpy = stubSavePlan();
		const writeText = stubClipboard(() => Promise.resolve());
		await renderResult();

		await shareButton().click();

		await vi.waitFor(() => expect(savePlanSpy).toHaveBeenCalledOnce());
		expect(savePlanSpy.mock.calls[0][0]).toEqual(RESULT);
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
		expect(writeText.mock.calls[0][0]).toContain('/plan/share/abc-123');
		await expect.element(page.getByText('リンクをコピーしました')).toBeInTheDocument();
	});

	it('2回目の共有は保存を再度呼ばずコピーだけする', async () => {
		const savePlanSpy = stubSavePlan();
		const writeText = stubClipboard(() => Promise.resolve());
		await renderResult();

		await shareButton().click();
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
		await vi.waitFor(() =>
			expect(page.getByText('リンクをコピーしました').elements().length).toBe(1)
		);

		await shareButton().click();

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
		expect(savePlanSpy).toHaveBeenCalledOnce();
	});

	it('保存APIがエラーを返したらエラーメッセージを表示する', async () => {
		savePlan.mockRejectedValue(httpError(500));
		await renderResult();

		await shareButton().click();

		await expect
			.element(page.getByText('プランの共有に失敗しました。時間をおいて再度お試しください。'))
			.toBeInTheDocument();
	});

	it('保存APIの通信自体が失敗してもエラーメッセージを表示する', async () => {
		savePlan.mockRejectedValue(new TypeError('Failed to fetch'));
		await renderResult();

		await shareButton().click();

		await expect
			.element(page.getByText('プランの共有に失敗しました。時間をおいて再度お試しください。'))
			.toBeInTheDocument();
	});

	it('クリップボードが使えない場合はURLを手動コピー用に表示する', async () => {
		stubSavePlan();
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
			stubSavePlan();
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
		const pending = new Promise<{ shareId: string }>((resolve) => {
			release = () => resolve({ shareId: 'abc-123' });
		});
		const savePlanSpy = savePlan.mockReturnValue(pending);
		const { container } = await renderResult();

		await shareButton().click();
		await expect.element(page.getByText('共有リンクを発行中…')).toBeInTheDocument();

		const button = container.querySelector('button');
		button?.removeAttribute('disabled');
		button?.click();

		expect(savePlanSpy).toHaveBeenCalledOnce();
		release?.();
	});
});

// issue #64: 「もう一度計画する」押下時に routeResult から planDraft を組み立てる挙動のテスト。
describe('/plan/result +page.svelte もう一度計画する（入力復元用のdraft組み立て）', () => {
	const FULL_RESULT: RouteResult = {
		summary: '浅草・東京タワーを巡る1日',
		origin: { name: '東京駅', displayAddress: '千代田区丸の内' },
		transportMode: 'car',
		startTime: '09:30',
		planDate: '2026-09-05',
		endDestination: { name: '新宿グランドホテル', displayAddress: '新宿区西新宿' },
		destinations: [
			{
				order: 2,
				name: '東京タワー',
				displayAddress: '港区芝公園',
				arrivalTime: '11:00',
				departureTime: '12:00',
				description: '',
				travelTimeFromPrevious: '30分',
				timeSlot: null,
				stayMinutes: null,
				arriveAt: null
			},
			{
				order: 1,
				name: '浅草寺',
				displayAddress: '台東区浅草',
				arrivalTime: '09:00',
				departureTime: '10:30',
				description: '雷門が有名',
				travelTimeFromPrevious: null,
				timeSlot: 'morning',
				stayMinutes: 90,
				arriveAt: '09:00'
			}
		]
	};

	it('全項目を含むresultなら、order昇順に並べ替えたplanDraftをセットしてから/planへ遷移する', async () => {
		routeResult.set(FULL_RESULT);
		await renderResult();

		await page.getByRole('button', { name: /もう一度計画する/ }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(get(planDraft)).toEqual({
			origin: { name: '東京駅', displayAddress: '千代田区丸の内' },
			transportMode: 'car',
			startTime: '09:30',
			planDate: '2026-09-05',
			endDestination: { name: '新宿グランドホテル', displayAddress: '新宿区西新宿' },
			locations: [
				{
					address: '浅草寺',
					displayAddress: '台東区浅草',
					timeSlot: 'morning',
					stayMinutes: 90,
					arriveAt: '09:00'
				},
				{
					address: '東京タワー',
					displayAddress: '港区芝公園',
					timeSlot: '',
					stayMinutes: '',
					arriveAt: ''
				}
			]
		});
	});

	it('未指定項目を含むresultなら、該当フィールドはnullまたは空文字になる', async () => {
		// RESULT フィクスチャは origin/transportMode/startTime/endDestination/timeSlot/stayMinutes/arriveAt を持たない
		await renderResult();

		await page.getByRole('button', { name: /もう一度計画する/ }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(get(planDraft)).toEqual({
			origin: null,
			transportMode: '',
			startTime: '',
			planDate: '',
			endDestination: null,
			locations: [
				{
					address: '浅草寺',
					displayAddress: '台東区浅草',
					timeSlot: '',
					stayMinutes: '',
					arriveAt: ''
				}
			]
		});
	});

	it.each([
		['null', null],
		['undefined（キー欠落）', undefined]
	])('planDateが%sならplanDraft.planDateは空文字になる', async (_label, planDate) => {
		routeResult.set({ ...RESULT, planDate });
		await renderResult();

		await page.getByRole('button', { name: /もう一度計画する/ }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(get(planDraft)?.planDate).toBe('');
	});

	it('未知のtransportModeは空文字に丸める', async () => {
		routeResult.set({ ...RESULT, transportMode: 'teleport' });
		await renderResult();

		await page.getByRole('button', { name: /もう一度計画する/ }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(get(planDraft)?.transportMode).toBe('');
	});
});
