import { page } from 'vite-plus/test/browser';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

// issue #189: パスキー登録の案内ページの表示テスト。
// use:enhance・パスキーのブラウザ操作・画面遷移は単体テストでは動かせないため差し替える。

const { isPasskeySupported, registerPasskey, goto } = vi.hoisted(() => ({
	isPasskeySupported: vi.fn(),
	registerPasskey: vi.fn(),
	goto: vi.fn()
}));

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('#lib/passkey-client.js', () => ({
	isPasskeySupported,
	registerPasskey,
	signInWithPasskey: vi.fn()
}));

const PasskeyPage = (await import('./+page.svelte')).default;

const REGISTER_FAILURE = 'パスキーを登録できませんでした。あとからでも登録できます。';

beforeEach(() => {
	isPasskeySupported.mockReturnValue(true);
	registerPasskey.mockResolvedValue(true);
	goto.mockClear();
	registerPasskey.mockClear();
});

describe('/passkey +page.svelte', () => {
	it('FR-013: 登録を勧める案内（「登録する」と「あとで」）を表示する', async () => {
		await render(PasskeyPage, { form: null, data: {} });

		await expect
			.element(page.getByRole('heading', { level: 1, name: /パスキー/ }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: '登録する' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'あとで' })).toBeInTheDocument();
	});

	it('FR-015: 「あとで」は ?/dismiss に POST する', async () => {
		const { container } = await render(PasskeyPage, { form: null, data: {} });

		const form = container.querySelector('form[action="?/dismiss"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
		expect(form?.textContent).toContain('あとで');
	});

	it('FR-014: 「登録する」で端末の確認を終えたら、登録できた旨と /plan への導線を表示する', async () => {
		registerPasskey.mockResolvedValue(true);
		await render(PasskeyPage, { form: null, data: {} });

		await page.getByRole('button', { name: '登録する' }).click();

		await expect.element(page.getByText('パスキーを登録しました')).toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: 'プランを作る' }))
			.toHaveAttribute('href', '/plan');
		expect(registerPasskey).toHaveBeenCalledOnce();
	});

	it('FR-016: 取り消し・失敗では登録できなかった旨と、あとで登録できる旨を表示する', async () => {
		registerPasskey.mockResolvedValue(false);
		await render(PasskeyPage, { form: null, data: {} });

		await page.getByRole('button', { name: '登録する' }).click();

		await expect.element(page.getByText(REGISTER_FAILURE)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'あとで' })).toBeInTheDocument();
	});

	it('FR-016: 失敗のあと、もう一度「登録する」を押せる', async () => {
		registerPasskey.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		await render(PasskeyPage, { form: null, data: {} });

		await page.getByRole('button', { name: '登録する' }).click();
		await expect.element(page.getByText(REGISTER_FAILURE)).toBeInTheDocument();
		await page.getByRole('button', { name: '登録する' }).click();

		await expect.element(page.getByText('パスキーを登録しました')).toBeInTheDocument();
	});

	it('FR-019: パスキーに対応していないブラウザでは、登録を試さず /plan へ移る', async () => {
		isPasskeySupported.mockReturnValue(false);

		await render(PasskeyPage, { form: null, data: {} });

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(goto.mock.calls[0][0]).toMatch(/\/plan$/);
		expect(registerPasskey).not.toHaveBeenCalled();
	});

	it('FR-019: 対応しているブラウザでは /plan へ自動で移らない', async () => {
		await render(PasskeyPage, { form: null, data: {} });

		await expect.element(page.getByRole('button', { name: '登録する' })).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});
