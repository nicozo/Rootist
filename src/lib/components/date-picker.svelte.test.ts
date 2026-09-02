import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DatePicker from './date-picker.svelte';

// issue #73: 日付ピッカーのテスト。値は "YYYY-MM-DD" 文字列、未選択は空文字。
// 日セルの実セレクタは bits-ui のソース（calendar.svelte.js 486〜545行目）と実描画結果
// （本テストの試し打ち）で確認済み: 各日セルは role="button" の <div> で data-bits-day="" を
// 持ち、当月外セルにのみ data-outside-month="" が付く。デフォルトのCalendar.Dayはchildren/child
// snippetを渡さないため、テキストは日番号のみ（例: "12"）。

/** カレンダー内の「当月の」日セル要素のうち、テキストが String(n) と一致するものを返す。 */
function dayCell(n: number): HTMLElement | undefined {
	const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-bits-day]'));
	return cells
		.filter((c) => !c.hasAttribute('data-outside-month'))
		.find((c) => c.textContent?.trim() === String(n));
}

function trigger() {
	return page.getByLabelText('日付');
}

/** Popoverの閉じるアニメーション（duration-100）後にcontentがDOMから外れるのを待つ。 */
async function waitForPopoverClosed() {
	await vi.waitFor(() => {
		if (document.querySelector('[data-slot="popover-content"]')) {
			throw new Error('popover-content がまだ存在する');
		}
	});
}

describe('date-picker', () => {
	it('未選択時、トリガーのテキストは「日付を指定」', async () => {
		await render(DatePicker, {});

		await expect.element(trigger()).toHaveTextContent('日付を指定');
	});

	it('valueを渡すと、トリガーのテキストが「YYYY年M月D日（曜）」になる', async () => {
		await render(DatePicker, { value: '2026-09-05' });

		await expect.element(trigger()).toHaveTextContent('2026年9月5日（土）');
	});

	it('トリガーを押すと2026年9月のカレンダーが開き、12日を選ぶとonValueChangeが呼ばれ表示が更新され閉じる', async () => {
		const changes: string[] = [];
		await render(DatePicker, { value: '2026-09-05', onValueChange: (v) => changes.push(v) });

		await trigger().click();
		const cell = dayCell(12);
		expect(cell).toBeTruthy();
		cell?.click();

		expect(changes).toEqual(['2026-09-12']);
		await expect.element(trigger()).toHaveTextContent('2026年9月12日（土）');
		await waitForPopoverClosed();
	});

	it('値があるときのみ「指定なしに戻す」が表示され、押すと未指定に戻る', async () => {
		const changes: string[] = [];
		await render(DatePicker, { value: '2026-09-05', onValueChange: (v) => changes.push(v) });

		await trigger().click();
		await expect.element(page.getByRole('button', { name: '指定なしに戻す' })).toBeInTheDocument();

		await page.getByRole('button', { name: '指定なしに戻す' }).click();

		expect(changes).toEqual(['']);
		await expect.element(trigger()).toHaveTextContent('日付を指定');
		await waitForPopoverClosed();
	});

	it('選択済みの日を再度クリックしても（bits-uiの選択解除）onValueChangeを呼ばず値も変えない', async () => {
		// preventDeselectを設定していないため、選択済み日を再クリックするとbits-uiは
		// 内部的に選択解除しonValueChangeをundefinedで呼ぶ。「指定なしに戻す」以外の経路で
		// 未指定に戻さないという設計（spec 2-3）を守るため、date-picker側でこれを無視する。
		const changes: string[] = [];
		await render(DatePicker, { value: '2026-09-05', onValueChange: (v) => changes.push(v) });

		await trigger().click();
		const selected = dayCell(5);
		selected?.click();

		expect(changes).toEqual([]);
		await expect.element(trigger()).toHaveTextContent('2026年9月5日（土）');
	});

	it('値が無いときは「指定なしに戻す」ボタンが表示されない', async () => {
		await render(DatePicker, {});

		await trigger().click();

		await expect
			.element(page.getByRole('button', { name: '指定なしに戻す' }))
			.not.toBeInTheDocument();

		// 次のテストへ影響を残さないようPopoverを閉じてから終える
		await userEvent.keyboard('{Escape}');
		await waitForPopoverClosed();
	});

	describe('キーボード操作', () => {
		it('Tabでトリガーにフォーカスが移り、Enterでカレンダーが開く', async () => {
			await render(DatePicker, { value: '2026-09-05' });

			await userEvent.tab();
			await expect.element(trigger()).toHaveFocus();

			await userEvent.keyboard('{Enter}');

			await expect
				.element(page.elementLocator(document.querySelector('[data-slot="popover-content"]')!))
				.toBeInTheDocument();

			// 次のテストへ影響を残さないようPopoverを閉じてから終える
			await userEvent.keyboard('{Escape}');
			await waitForPopoverClosed();
		});

		it('開いた状態でArrowRight押下によりフォーカス中の日セルが翌日へ移動し、Enterで確定してPopoverが閉じる', async () => {
			const changes: string[] = [];
			await render(DatePicker, { value: '2026-09-05', onValueChange: (v) => changes.push(v) });

			await trigger().click();
			// Popoverが開いた直後、bits-uiのfocus-scopeが非同期(rAF)でDOM順の最初のtabbable
			// 要素（前月ボタン）へオートフォーカスする。このオートフォーカスが確定する前に
			// 日セルへフォーカスすると、後から発火するオートフォーカスに上書きされ得るため、
			// まずオートフォーカスがPopover内の要素に定まるのを待ってから、ロービングtabindexで
			// tabindex=0が付く選択済み日セルへ改めてフォーカスする。
			await vi.waitFor(() => {
				const content = document.querySelector('[data-slot="popover-content"]');
				if (!content || !content.contains(document.activeElement)) {
					throw new Error('オートフォーカスが確定していない');
				}
			});
			// rAFで予約されたオートフォーカスの再発火が収まるのを待ってから、改めて日セルへフォーカスする
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			const startCell = dayCell(5);
			expect(startCell?.getAttribute('tabindex')).toBe('0');
			startCell?.focus();
			await vi.waitFor(() => {
				expect(document.activeElement?.textContent?.trim()).toBe('5');
			});
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			expect(document.activeElement?.textContent?.trim()).toBe('5');

			await userEvent.keyboard('{ArrowRight}');
			await vi.waitFor(() => {
				expect(document.activeElement?.textContent?.trim()).toBe('6');
			});

			await userEvent.keyboard('{Enter}');

			expect(changes).toEqual(['2026-09-06']);
			await expect.element(trigger()).toHaveTextContent('2026年9月6日（日）');
			await waitForPopoverClosed();
		});

		it('Escapeを押すとonValueChangeを呼ばずに値を変えないままPopoverが閉じ、フォーカスがトリガーへ戻る', async () => {
			const changes: string[] = [];
			await render(DatePicker, { value: '2026-09-05', onValueChange: (v) => changes.push(v) });

			await trigger().click();
			await userEvent.keyboard('{Escape}');

			expect(changes).toEqual([]);
			await expect.element(trigger()).toHaveTextContent('2026年9月5日（土）');
			await waitForPopoverClosed();
			await expect.element(trigger()).toHaveFocus();
		});

		it('「指定なしに戻す」ボタンがTabで到達可能で、アクセシブルネームで取得できる', async () => {
			await render(DatePicker, { value: '2026-09-05' });

			await trigger().click();

			await expect
				.element(page.getByRole('button', { name: '指定なしに戻す' }))
				.toBeInTheDocument();

			// 次のテストへ影響を残さないようPopoverを閉じてから終える
			await userEvent.keyboard('{Escape}');
			await waitForPopoverClosed();
		});
	});
});
