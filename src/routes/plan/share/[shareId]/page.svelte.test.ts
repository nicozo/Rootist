import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SharePage from './+page.svelte';
import type { RouteResult } from '$lib/stores/route';

// issue #62: 共有プラン閲覧ページ（認証不要・SSR）の表示テスト。

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

describe('/plan/share/[shareId] +page.svelte', () => {
	it('共有プランであることが分かる見出しを表示する', async () => {
		await render(SharePage, {
			data: { user: null, result: RESULT },
			params: { shareId: 'abc' },
			form: null
		});

		await expect
			.element(page.getByRole('heading', { level: 1, name: '共有されたプラン' }))
			.toBeInTheDocument();
	});

	it('渡されたプランの内容を表示する', async () => {
		await render(SharePage, {
			data: { user: null, result: RESULT },
			params: { shareId: 'abc' },
			form: null
		});

		await expect.element(page.getByText('浅草を巡る1日')).toBeInTheDocument();
		await expect.element(page.getByText('浅草寺')).toBeInTheDocument();
		await expect.element(page.getByText('09:00 - 10:30')).toBeInTheDocument();
	});

	it('自分でプランを作るための導線を表示する', async () => {
		await render(SharePage, {
			data: { user: null, result: RESULT },
			params: { shareId: 'abc' },
			form: null
		});

		await expect.element(page.getByText('自分だけの旅程を作ってみませんか？')).toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: '自分もプランを作成する' }))
			.toBeInTheDocument();
	});

	it('planDateを持つプランでは共有ページにも同じ日付文字列を表示する', async () => {
		await render(SharePage, {
			data: { user: null, result: { ...RESULT, planDate: '2026-09-05' } },
			params: { shareId: 'abc' },
			form: null
		});

		await expect.element(page.getByText('2026年9月5日（土）')).toBeInTheDocument();
	});

	it('目的地が空のプランでも描画できる', async () => {
		const { container } = await render(SharePage, {
			data: { user: null, result: { summary: '目的地なし', destinations: [] } },
			params: { shareId: 'abc' },
			form: null
		});

		expect(container.textContent).toContain('目的地なし');
	});
});
