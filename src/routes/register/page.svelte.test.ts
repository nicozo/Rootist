import { page } from 'vite-plus/test/browser';
import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

// issue #189: 新規登録ページの表示テスト。use:enhance は何もしない版に差し替える。
// パスキーに対応したブラウザでも、登録画面にパスキーのボタンは出ない（FR-012）。

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));
vi.mock('#lib/passkey-client.js', () => ({
	isPasskeySupported: () => true,
	signInWithPasskey: vi.fn(),
	registerPasskey: vi.fn()
}));

const RegisterPage = (await import('./+page.svelte')).default;

/** loadが返すdataの既定値。 */
function data(overrides: Record<string, unknown> = {}) {
	return { user: null, googleAuthEnabled: false, ...overrides };
}

describe('/register +page.svelte', () => {
	it('見出しを表示する', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await expect
			.element(page.getByRole('heading', { level: 1, name: '新規登録' }))
			.toBeInTheDocument();
	});

	it('FR-001: パスワードの入力欄・文言がどこにも無い', async () => {
		const { container } = await render(RegisterPage, { form: null, data: data() });

		expect(container.querySelector('input[type="password"]')).toBeNull();
		expect(container.textContent).not.toContain('パスワード');
	});

	it('FR-012: メールのコードで始められる', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await expect.element(page.getByLabelText('メールアドレス')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'コードを送る' })).toBeInTheDocument();
	});

	it('FR-012: Google でも始められ、パスキーのボタンは出さない', async () => {
		const { container } = await render(RegisterPage, {
			form: null,
			data: data({ googleAuthEnabled: true })
		});

		await expect.element(page.getByRole('button', { name: /Googleで登録/ })).toBeInTheDocument();
		const form = container.querySelector('form[action="/auth/google"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
		await expect.element(page.getByRole('button', { name: 'コードを送る' })).toBeInTheDocument();
		expect(container.textContent).not.toContain('パスキー');
	});

	it('Googleログインが無効ならボタンを表示しない', async () => {
		const { container } = await render(RegisterPage, {
			form: null,
			data: data({ googleAuthEnabled: false })
		});

		expect(container.querySelector('form[action="/auth/google"]')).toBeNull();
	});

	it('FR-011: 形式エラーのメッセージを表示する', async () => {
		await render(RegisterPage, {
			form: { step: 'email', message: 'メールアドレスの形式が正しくありません', email: 'bad' },
			data: data()
		});

		await expect
			.element(page.getByText('メールアドレスの形式が正しくありません'))
			.toBeInTheDocument();
	});

	it('FR-004: コード入力の画面では送り先を表示する', async () => {
		await render(RegisterPage, {
			form: { step: 'code', email: 'a@example.com' },
			data: data()
		});

		await expect.element(page.getByLabelText('6桁のコード')).toBeInTheDocument();
		await expect.element(page.getByText(/a@example\.com/)).toBeInTheDocument();
	});

	it('ログインページへのリンクを表示する', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await expect.element(page.getByRole('link', { name: 'ログイン' })).toBeInTheDocument();
	});
});
