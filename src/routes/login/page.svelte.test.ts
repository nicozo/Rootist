import { page } from 'vite-plus/test/browser';
import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

// issue #199: ログインページの表示テスト。手段は「Googleでログイン」だけ（FR-001, FR-002, FR-012, FR-013）。

const LoginPage = (await import('./+page.svelte')).default;

/** loadが返すdataの既定値。 */
function data(overrides: Record<string, unknown> = {}) {
	return { user: null, googleAuthEnabled: false, googleError: null, ...overrides };
}

describe('/login +page.svelte', () => {
	it('見出しを表示する', async () => {
		await render(LoginPage, { form: null, data: data() });

		await expect
			.element(page.getByRole('heading', { level: 1, name: 'ログイン' }))
			.toBeInTheDocument();
	});

	it('FR-001: Google が有効なら「Googleでログイン」のボタンを表示する', async () => {
		await render(LoginPage, { form: null, data: data({ googleAuthEnabled: true }) });

		await expect
			.element(page.getByRole('button', { name: /Googleでログイン/ }))
			.toBeInTheDocument();
	});

	it('FR-001: Google が有効なら POST /auth/google のフォームで送る', async () => {
		const { container } = await render(LoginPage, {
			form: null,
			data: data({ googleAuthEnabled: true })
		});

		const form = container.querySelector('form[action="/auth/google"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
	});

	it('FR-002, FR-013: Google が有効でも、メールアドレス・コード・パスワードの欄と他の手段・新規登録が無い', async () => {
		const { container } = await render(LoginPage, {
			form: null,
			data: data({ googleAuthEnabled: true })
		});

		expect(container.querySelector('input[type="email"]')).toBeNull();
		expect(container.querySelector('input[type="password"]')).toBeNull();
		expect(container.querySelector('input[type="text"], input[inputmode="numeric"]')).toBeNull();
		expect(container.querySelectorAll('form')).toHaveLength(1);
		expect(container.textContent).not.toContain('メールアドレス');
		expect(container.textContent).not.toContain('コードを送る');
		expect(container.textContent).not.toContain('パスワード');
		expect(container.textContent).not.toContain('パスキー');
		expect(container.textContent).not.toContain('新規登録');
		expect(container.querySelector('a[href*="register"]')).toBeNull();
	});

	it('FR-012: Google が無効なら「現在ログインできません。」を表示しボタンを出さない', async () => {
		const { container } = await render(LoginPage, {
			form: null,
			data: data({ googleAuthEnabled: false })
		});

		await expect.element(page.getByText('現在ログインできません。')).toBeInTheDocument();
		expect(container.textContent).not.toContain('Googleでログイン');
		expect(container.querySelector('form[action="/auth/google"]')).toBeNull();
		expect(container.querySelector('button')).toBeNull();
	});

	it('FR-007: Googleログイン失敗のメッセージを表示する', async () => {
		await render(LoginPage, {
			form: null,
			data: data({ googleError: 'Googleログインを完了できませんでした。もう一度お試しください。' })
		});

		await expect
			.element(page.getByText('Googleログインを完了できませんでした。もう一度お試しください。'))
			.toBeInTheDocument();
	});

	it('エラーが無ければアラートを表示しない', async () => {
		const { container } = await render(LoginPage, { form: null, data: data() });

		expect(container.querySelector('[data-slot="alert"]')).toBeNull();
	});
});
