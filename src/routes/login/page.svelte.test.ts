import { page } from 'vite-plus/test/browser';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

// issue #189: ログインページの表示テスト。
// use:enhance・パスキーのブラウザ操作・画面遷移は単体テストでは動かせないため差し替える。

const { isPasskeySupported, signInWithPasskey, goto } = vi.hoisted(() => ({
	isPasskeySupported: vi.fn(),
	signInWithPasskey: vi.fn(),
	goto: vi.fn()
}));

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('#lib/passkey-client.js', () => ({
	isPasskeySupported,
	signInWithPasskey,
	registerPasskey: vi.fn()
}));

const LoginPage = (await import('./+page.svelte')).default;

const PASSKEY_LOGIN_FAILURE =
	'パスキーでログインできませんでした。メールのコードかGoogleでもログインできます。';

/** loadが返すdataの既定値。 */
function data(overrides: Record<string, unknown> = {}) {
	return { user: null, googleAuthEnabled: false, googleError: null, ...overrides };
}

beforeEach(() => {
	isPasskeySupported.mockReturnValue(true);
	signInWithPasskey.mockResolvedValue(true);
	goto.mockClear();
	signInWithPasskey.mockClear();
});

describe('/login +page.svelte', () => {
	it('見出しを表示する', async () => {
		await render(LoginPage, { form: null, data: data() });

		await expect
			.element(page.getByRole('heading', { level: 1, name: 'ログイン' }))
			.toBeInTheDocument();
	});

	it('FR-001: パスワードの入力欄・文言がどこにも無い', async () => {
		const { container } = await render(LoginPage, { form: null, data: data() });

		expect(container.querySelector('input[type="password"]')).toBeNull();
		expect(container.textContent).not.toContain('パスワード');
	});

	it('FR-002: メールのコード・パスキー・Google の 3 つの手段を表示する', async () => {
		await render(LoginPage, { form: null, data: data({ googleAuthEnabled: true }) });

		await expect.element(page.getByLabelText('メールアドレス')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'コードを送る' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'パスキーでログイン' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /Googleでログイン/ }))
			.toBeInTheDocument();
	});

	it('FR-019: パスキーに対応していないブラウザでは「パスキーでログイン」を表示しない', async () => {
		isPasskeySupported.mockReturnValue(false);

		const { container } = await render(LoginPage, {
			form: null,
			data: data({ googleAuthEnabled: true })
		});

		await expect.element(page.getByRole('button', { name: 'コードを送る' })).toBeInTheDocument();
		expect(container.textContent).not.toContain('パスキーでログイン');
		await expect
			.element(page.getByRole('button', { name: /Googleでログイン/ }))
			.toBeInTheDocument();
	});

	it('エラーが無ければアラートを表示しない', async () => {
		const { container } = await render(LoginPage, { form: null, data: data() });

		expect(container.querySelector('[data-slot="alert"]')).toBeNull();
	});

	it('コード入力の画面（form.step === code）では送り先を表示する', async () => {
		await render(LoginPage, {
			form: { step: 'code', email: 'a@example.com' },
			data: data()
		});

		await expect.element(page.getByLabelText('6桁のコード')).toBeInTheDocument();
		await expect.element(page.getByText(/a@example\.com/)).toBeInTheDocument();
	});

	it('FR-008: コードの失敗メッセージを表示する', async () => {
		await render(LoginPage, {
			form: {
				step: 'code',
				message: 'コードが正しくないか、期限が切れています。',
				email: 'a@example.com'
			},
			data: data()
		});

		await expect
			.element(page.getByText('コードが正しくないか、期限が切れています。'))
			.toBeInTheDocument();
	});

	it('FR-021: Googleログイン失敗のメッセージを表示する', async () => {
		await render(LoginPage, {
			form: null,
			data: data({ googleError: 'Googleログインを完了できませんでした。もう一度お試しください。' })
		});

		await expect
			.element(page.getByText('Googleログインを完了できませんでした。もう一度お試しください。'))
			.toBeInTheDocument();
	});

	it('Googleログインが無効ならボタンを表示しない', async () => {
		const { container } = await render(LoginPage, {
			form: null,
			data: data({ googleAuthEnabled: false })
		});

		expect(container.textContent).not.toContain('Googleでログイン');
		expect(container.querySelector('form[action="/auth/google"]')).toBeNull();
	});

	it('Googleログインが有効ならPOST /auth/google のボタンを表示する', async () => {
		const { container } = await render(LoginPage, {
			form: null,
			data: data({ googleAuthEnabled: true })
		});

		const form = container.querySelector('form[action="/auth/google"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
	});

	it('新規登録ページへのリンクを表示する', async () => {
		await render(LoginPage, { form: null, data: data() });

		await expect.element(page.getByRole('link', { name: '新規登録' })).toBeInTheDocument();
	});
});

describe('/login パスキーでログイン', () => {
	it('FR-017: 端末の確認が終われば /plan へ移る', async () => {
		signInWithPasskey.mockResolvedValue(true);
		await render(LoginPage, { form: null, data: data() });

		await page.getByRole('button', { name: 'パスキーでログイン' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledOnce());
		expect(goto.mock.calls[0][0]).toMatch(/\/plan$/);
	});

	it('FR-018: 取り消し・失敗ではログイン画面のまま、メールのコードかGoogleでも入れる旨を表示する', async () => {
		signInWithPasskey.mockResolvedValue(false);
		await render(LoginPage, { form: null, data: data() });

		await page.getByRole('button', { name: 'パスキーでログイン' }).click();

		await expect.element(page.getByText(PASSKEY_LOGIN_FAILURE)).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: 'コードを送る' })).toBeInTheDocument();
	});

	it('FR-018: もう一度押せば再び試せる', async () => {
		signInWithPasskey.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		await render(LoginPage, { form: null, data: data() });

		await page.getByRole('button', { name: 'パスキーでログイン' }).click();
		await expect.element(page.getByText(PASSKEY_LOGIN_FAILURE)).toBeInTheDocument();
		await page.getByRole('button', { name: 'パスキーでログイン' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledOnce());
		expect(signInWithPasskey).toHaveBeenCalledTimes(2);
	});
});
