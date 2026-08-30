import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PlanTimeline from './plan-timeline.svelte';
import type { RouteDestination, RouteResult } from '$lib/stores/route';

// issue #62: プラン表示タイムラインのテスト。/plan/result と共有ページの両方で使われる。

/** 必須項目を満たす目的地を作る。 */
function destination(order: number, overrides: Partial<RouteDestination> = {}): RouteDestination {
	return {
		order,
		name: `場所${order}`,
		displayAddress: `住所${order}`,
		arrivalTime: '09:00',
		departureTime: '10:00',
		description: `説明${order}`,
		travelTimeFromPrevious: null,
		...overrides
	};
}

/** 最小構成のプラン結果を作る。 */
function result(overrides: Partial<RouteResult> = {}): RouteResult {
	return { destinations: [destination(1)], summary: '概要', ...overrides };
}

// intro を有効にして、各カードの in: トランジションも実際に走らせる。
/** タイムラインを描画する。 */
function renderTimeline(value: RouteResult) {
	return render(PlanTimeline, { props: { result: value }, intro: true });
}

describe('plan-timeline', () => {
	it('概要を表示する', async () => {
		await renderTimeline(result({ summary: '浅草を巡る1日' }));

		await expect.element(page.getByText('浅草を巡る1日')).toBeInTheDocument();
	});

	it('目的地の名前・住所・時刻・説明を表示する', async () => {
		await renderTimeline(
			result({
				destinations: [
					destination(1, {
						name: '浅草寺',
						displayAddress: '台東区',
						arrivalTime: '09:00',
						departureTime: '10:30',
						description: '雷門が有名'
					})
				]
			})
		);

		await expect.element(page.getByText('浅草寺')).toBeInTheDocument();
		await expect.element(page.getByText('台東区')).toBeInTheDocument();
		await expect.element(page.getByText('09:00 - 10:30')).toBeInTheDocument();
		await expect.element(page.getByText('雷門が有名')).toBeInTheDocument();
	});

	it('目的地の順番を番号で表示する', async () => {
		const { container } = await renderTimeline(
			result({ destinations: [destination(1), destination(2)] })
		);

		expect(container.textContent).toContain('場所1');
		expect(container.textContent).toContain('場所2');
	});

	it.each([
		['transit', '公共交通機関'],
		['car', '車'],
		['walking', '徒歩']
	])('移動手段 %s を日本語で表示する', async (mode, label) => {
		await renderTimeline(result({ transportMode: mode }));

		await expect.element(page.getByText(label, { exact: true })).toBeInTheDocument();
	});

	it('未知の移動手段はどのラベルも表示しない', async () => {
		const { container } = await renderTimeline(result({ transportMode: 'boat' }));

		expect(container.textContent).not.toContain('公共交通機関');
		expect(container.textContent).not.toContain('徒歩');
	});

	it('移動手段が未指定なら移動手段の行を表示しない', async () => {
		const { container } = await renderTimeline(result({ transportMode: null }));

		expect(container.textContent).not.toContain('公共交通機関');
	});

	it('出発地があれば「出発地」として表示する', async () => {
		await renderTimeline(result({ origin: { name: '東京駅', displayAddress: '千代田区' } }));

		await expect.element(page.getByText('出発地')).toBeInTheDocument();
		await expect.element(page.getByText('東京駅')).toBeInTheDocument();
	});

	it('出発地が無ければ「出発地」を表示しない', async () => {
		const { container } = await renderTimeline(result());

		expect(container.textContent).not.toContain('出発地');
	});

	it('終点があれば「ゴール」として表示する', async () => {
		await renderTimeline(result({ endDestination: { name: 'ホテル', displayAddress: '新宿区' } }));

		await expect.element(page.getByText('ゴール')).toBeInTheDocument();
		await expect.element(page.getByText('ホテル')).toBeInTheDocument();
	});

	it('終点が無ければ「ゴール」を表示しない', async () => {
		const { container } = await renderTimeline(result({ endDestination: null }));

		expect(container.textContent).not.toContain('ゴール');
	});

	it('移動時間があれば表示する', async () => {
		await renderTimeline(
			result({
				destinations: [destination(1, { travelTimeFromPrevious: '半蔵門線で約19分' })]
			})
		);

		await expect.element(page.getByText('半蔵門線で約19分')).toBeInTheDocument();
	});

	it('路線情報があれば移動時間に添えて表示する', async () => {
		await renderTimeline(
			result({
				destinations: [
					destination(1, {
						travelTimeFromPrevious: '半蔵門線で約19分',
						transitRoute: '半蔵門線（押上駅下車）'
					})
				]
			})
		);

		await expect.element(page.getByText('半蔵門線（押上駅下車）')).toBeInTheDocument();
	});

	it('路線情報が無ければ移動時間だけを表示する', async () => {
		const { container } = await renderTimeline(
			result({
				destinations: [
					destination(1, { travelTimeFromPrevious: '徒歩で約10分', transitRoute: null })
				]
			})
		);

		expect(container.textContent).toContain('徒歩で約10分');
	});

	it.each([
		['morning', '朝指定'],
		['noon', '昼指定'],
		['night', '晩指定']
	])('時間帯 %s のバッジを表示する', async (slot, label) => {
		await renderTimeline(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			result({ destinations: [destination(1, { timeSlot: slot as any })] })
		);

		await expect.element(page.getByText(label)).toBeInTheDocument();
	});

	it('時間帯がnullならバッジを表示しない', async () => {
		const { container } = await renderTimeline(
			result({ destinations: [destination(1, { timeSlot: null })] })
		);

		expect(container.textContent).not.toContain('指定');
	});

	it('未知の時間帯ならバッジを表示しない', async () => {
		const { container } = await renderTimeline(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			result({ destinations: [destination(1, { timeSlot: 'midnight' as any })] })
		);

		expect(container.textContent).not.toContain('指定');
	});

	it.each([
		[30, '滞在30分指定'],
		[60, '滞在1時間指定'],
		[90, '滞在1時間30分指定'],
		[120, '滞在2時間指定'],
		[180, '滞在3時間指定'],
		[240, '滞在4時間指定'],
		[360, '滞在6時間指定']
	])('滞在時間 %i分 のバッジ「%s」を表示する', async (stayMinutes, label) => {
		await renderTimeline(result({ destinations: [destination(1, { stayMinutes })] }));

		await expect.element(page.getByText(label)).toBeInTheDocument();
	});

	it('滞在時間がnullならバッジを表示しない', async () => {
		const { container } = await renderTimeline(
			result({ destinations: [destination(1, { stayMinutes: null })] })
		);

		expect(container.textContent).not.toContain('滞在');
	});

	it('滞在時間がundefinedならバッジを表示しない', async () => {
		const { container } = await renderTimeline(result({ destinations: [destination(1)] }));

		expect(container.textContent).not.toContain('滞在');
	});

	it('whitelist外の滞在時間ならバッジを表示しない', async () => {
		const { container } = await renderTimeline(
			result({ destinations: [destination(1, { stayMinutes: 999 })] })
		);

		expect(container.textContent).not.toContain('滞在');
	});

	it('時間帯・滞在時間の両方が指定された目的地は両方のバッジを表示する', async () => {
		await renderTimeline(
			result({
				destinations: [destination(1, { timeSlot: 'noon', stayMinutes: 60 })]
			})
		);

		await expect.element(page.getByText('昼指定')).toBeInTheDocument();
		await expect.element(page.getByText('滞在1時間指定')).toBeInTheDocument();
	});

	it('目的地が空でも描画できる', async () => {
		const { container } = await renderTimeline(result({ destinations: [], summary: '目的地なし' }));

		expect(container.textContent).toContain('目的地なし');
	});
});
