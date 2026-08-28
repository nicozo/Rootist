import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import UserMenu from './user-menu.svelte';

// issue #62: アバター＋ドロップダウンメニューのコンポーネントテスト。

const USER = { email: 'taro@example.com', name: 'たろう', image: null };

/** トリガーを押してメニューを開く。 */
async function openMenu() {
	const trigger = page.getByRole('button', { name: 'アカウントメニュー' });
	await trigger.click();
	return trigger;
}

/** フォールバックアバター要素のstyle属性を取得する。 */
function fallbackStyle(container: HTMLElement) {
	return container.querySelector('[aria-hidden="true"]')?.getAttribute('style') ?? '';
}

describe('user-menu', () => {
	it('アバターのトリガーを表示する', async () => {
		await render(UserMenu, { user: USER });

		await expect
			.element(page.getByRole('button', { name: 'アカウントメニュー' }))
			.toBeInTheDocument();
	});

	it('メニューを開く前はログアウトを露出しない', async () => {
		await render(UserMenu, { user: USER });

		await expect.element(page.getByText('ログアウト')).not.toBeInTheDocument();
	});

	it('トリガーを押すと名前・メール・ログアウトを表示する', async () => {
		await render(UserMenu, { user: USER });

		await openMenu();

		await expect.element(page.getByText('たろう')).toBeInTheDocument();
		await expect.element(page.getByText('taro@example.com')).toBeInTheDocument();
		await expect.element(page.getByRole('menuitem', { name: /ログアウト/ })).toBeInTheDocument();
	});

	it('ログアウトはPOST /logout のformとして構成する', async () => {
		const { container } = await render(UserMenu, { user: USER });

		await openMenu();

		const form = container.ownerDocument.querySelector('form[action="/logout"]');
		expect(form).not.toBeNull();
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
	});

	it('名前の先頭文字を大文字にしてイニシャルにする', async () => {
		const { container } = await render(UserMenu, {
			user: { ...USER, name: 'taro', email: 'taro@example.com' }
		});

		expect(container.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('T');
	});

	it('名前が空ならメールの先頭文字をイニシャルにする', async () => {
		const { container } = await render(UserMenu, { user: { ...USER, name: '' } });

		expect(container.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('T');
	});

	it('サロゲートペアの名前でも1文字として扱う', async () => {
		const { container } = await render(UserMenu, { user: { ...USER, name: '😀たろう' } });

		expect(container.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('😀');
	});

	it('同一メールなら再描画しても同じ色になる', async () => {
		const first = await render(UserMenu, { user: USER });
		const firstStyle = fallbackStyle(first.container);
		await first.unmount();

		const second = await render(UserMenu, { user: { ...USER, name: '別の名前' } });

		expect(fallbackStyle(second.container)).toBe(firstStyle);
		expect(firstStyle).toMatch(/oklch\(0\.85 0\.06 \d+\)/);
	});

	it('メールが異なれば色も変わる', async () => {
		const first = await render(UserMenu, { user: USER });
		const firstStyle = fallbackStyle(first.container);
		await first.unmount();

		const second = await render(UserMenu, { user: { ...USER, email: 'hanako@example.com' } });

		expect(fallbackStyle(second.container)).not.toBe(firstStyle);
	});

	it('プロフィール画像があればアバター画像を描画する', async () => {
		const { container } = await render(UserMenu, {
			user: { ...USER, image: 'https://example.com/a.png' }
		});

		const img = container.querySelector('img');
		expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
	});

	it('ログアウトを選ぶとformを送信する', async () => {
		const { container } = await render(UserMenu, { user: USER });

		await openMenu();

		// jsdomではなく実ブラウザなので、実際に送信されるとページ遷移してしまう。
		// requestSubmit()が呼ばれたことだけを確かめるため送信は差し止める。
		const form = container.ownerDocument.querySelector('form[action="/logout"]');
		const requestSubmit = vi.fn();
		Object.defineProperty(form!, 'requestSubmit', { value: requestSubmit, configurable: true });

		await page.getByRole('menuitem', { name: /ログアウト/ }).click();

		await vi.waitFor(() => expect(requestSubmit).toHaveBeenCalledOnce());
	});
});
