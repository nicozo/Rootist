import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TimePicker from './time-picker.svelte';

// issue #62: 時刻選択コンポーネントのテスト。値は "HH:MM" 文字列で未選択は空文字。

/** 時・分のトリガーに表示されている文字列を取り出す。 */
function displayed(container: HTMLElement) {
	const [hourTrigger, minuteTrigger] = container.querySelectorAll(
		'[aria-label="時"], [aria-label="分"]'
	);
	return {
		hour: hourTrigger?.textContent?.trim(),
		minute: minuteTrigger?.textContent?.trim()
	};
}

describe('time-picker', () => {
	it('未選択なら時・分ともにプレースホルダを表示する', async () => {
		const { container } = await render(TimePicker, {});

		expect(displayed(container)).toEqual({ hour: '--', minute: '--' });
	});

	it('値を渡すと時と分に分解して表示する', async () => {
		const { container } = await render(TimePicker, { value: '09:30' });

		expect(displayed(container)).toEqual({ hour: '09', minute: '30' });
	});

	it('時・分それぞれにアクセシブルな名前を付ける', async () => {
		await render(TimePicker, { value: '09:30' });

		await expect.element(page.getByLabelText('時')).toBeInTheDocument();
		await expect.element(page.getByLabelText('分')).toBeInTheDocument();
	});

	it('idを渡すと時のトリガーに割り当てる（label関連付け用）', async () => {
		const { container } = await render(TimePicker, { id: 'start-time' });

		expect(container.querySelector('#start-time')).not.toBeNull();
	});

	it('時を選ぶと分を00で補完した値になる', async () => {
		const { container } = await render(TimePicker, {});

		await page.getByLabelText('時').click();
		await page.getByRole('option', { name: '10' }).click();

		expect(displayed(container).hour).toBe('10');
		expect(displayed(container).minute).toBe('00');
	});

	it('分を選ぶと時を00で補完した値になる', async () => {
		const { container } = await render(TimePicker, {});

		await page.getByLabelText('分').click();
		await page.getByRole('option', { name: '45' }).click();

		expect(displayed(container).hour).toBe('00');
		expect(displayed(container).minute).toBe('45');
	});

	it('既存の値がある状態で時を変えても分は保持する', async () => {
		const { container } = await render(TimePicker, { value: '09:30' });

		await page.getByLabelText('時').click();
		await page.getByRole('option', { name: '14' }).click();

		expect(displayed(container)).toEqual({ hour: '14', minute: '30' });
	});

	it('既存の値がある状態で分を変えても時は保持する', async () => {
		const { container } = await render(TimePicker, { value: '09:30' });

		await page.getByLabelText('分').click();
		await page.getByRole('option', { name: '15' }).click();

		expect(displayed(container)).toEqual({ hour: '09', minute: '15' });
	});

	it('時は24時間ぶんの選択肢を持つ', async () => {
		await render(TimePicker, {});

		await page.getByLabelText('時').click();

		await expect.element(page.getByRole('option', { name: '00' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: '23' })).toBeInTheDocument();
	});

	it('分は15分刻みの選択肢を持つ', async () => {
		await render(TimePicker, {});

		await page.getByLabelText('分').click();

		for (const m of ['00', '15', '30', '45']) {
			await expect.element(page.getByRole('option', { name: m })).toBeInTheDocument();
		}
	});
});
