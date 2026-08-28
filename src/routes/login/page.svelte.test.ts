import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

// issue #62: ログインページの表示テスト。
// `use:enhance` は本来サーバーのForm Actionへfetchするため単体テストでは動かせない。
// 検証したいのはページが渡すコールバック（送信中フラグとパスワード欄のクリア）なので、
// submitイベントを捕まえて同じ順序で呼び出すだけの最小実装に差し替える。
const { enhance, updateCalls } = vi.hoisted(() => {
	const updateCalls = vi.fn();
	const enhance = (
		form: HTMLFormElement,
		submitFn?: (input: unknown) => unknown | Promise<unknown>
	) => {
		const onSubmit = async (event: Event) => {
			event.preventDefault();
			const afterSubmit = await submitFn?.({
				formElement: form,
				formData: new FormData(form),
				action: new URL('http://localhost/login'),
				controller: new AbortController(),
				submitter: null,
				cancel: () => {}
			});
			if (typeof afterSubmit === 'function') {
				await afterSubmit({
					result: { type: 'failure', status: 400, data: {} },
					update: async () => updateCalls()
				});
			}
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	};
	return { enhance, updateCalls };
});

vi.mock('$app/forms', () => ({ enhance }));

const LoginPage = (await import('./+page.svelte')).default;

/** loadが返すdataの既定値。 */
function data(overrides: Record<string, unknown> = {}) {
	return { user: null, googleAuthEnabled: false, googleError: null, ...overrides };
}

describe('/login +page.svelte', () => {
	it('見出しと説明を表示する', async () => {
		await render(LoginPage, { form: null, data: data() });

		await expect
			.element(page.getByRole('heading', { level: 1, name: 'ログイン' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('メールアドレスとパスワードでログインします。'))
			.toBeInTheDocument();
	});

	it('メールとパスワードの入力欄をラベル付きで表示する', async () => {
		await render(LoginPage, { form: null, data: data() });

		await expect.element(page.getByLabelText('メールアドレス')).toBeInTheDocument();
		await expect.element(page.getByLabelText('パスワード')).toBeInTheDocument();
	});

	it('パスワード欄をマスク表示にする', async () => {
		const { container } = await render(LoginPage, { form: null, data: data() });

		expect(container.querySelector('#password')?.getAttribute('type')).toBe('password');
	});

	it('エラーが無ければアラートを表示しない', async () => {
		const { container } = await render(LoginPage, { form: null, data: data() });

		expect(container.querySelector('[data-slot="alert"]')).toBeNull();
	});

	it('ログイン失敗のメッセージを表示する', async () => {
		await render(LoginPage, {
			form: { message: 'メールアドレスまたはパスワードが違います', email: 'a@example.com' },
			data: data()
		});

		await expect
			.element(page.getByText('メールアドレスまたはパスワードが違います'))
			.toBeInTheDocument();
	});

	it('Googleログイン失敗のメッセージを表示する', async () => {
		await render(LoginPage, {
			form: null,
			data: data({ googleError: 'Googleログインを完了できませんでした。もう一度お試しください。' })
		});

		await expect
			.element(page.getByText('Googleログインを完了できませんでした。もう一度お試しください。'))
			.toBeInTheDocument();
	});

	it('両方のエラーがあればフォームのメッセージを優先する', async () => {
		const { container } = await render(LoginPage, {
			form: { message: 'フォーム側のエラー', email: '' },
			data: data({ googleError: 'Google側のエラー' })
		});

		expect(container.textContent).toContain('フォーム側のエラー');
		expect(container.textContent).not.toContain('Google側のエラー');
	});

	it('失敗時は入力されたメールを復元する', async () => {
		await render(LoginPage, {
			form: { message: 'エラー', email: 'a@example.com' },
			data: data()
		});

		await expect.element(page.getByLabelText('メールアドレス')).toHaveValue('a@example.com');
	});

	it('失敗時もパスワードは復元しない', async () => {
		await render(LoginPage, {
			form: { message: 'エラー', email: 'a@example.com' },
			data: data()
		});

		await expect.element(page.getByLabelText('パスワード')).toHaveValue('');
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

		await expect
			.element(page.getByRole('button', { name: /Googleでログイン/ }))
			.toBeInTheDocument();
		const form = container.querySelector('form[action="/auth/google"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
	});

	it('新規登録ページへのリンクを表示する', async () => {
		await render(LoginPage, { form: null, data: data() });

		await expect.element(page.getByRole('link', { name: '新規登録' })).toBeInTheDocument();
	});
});

describe('/login 送信中の挙動', () => {
	/** メールとパスワードを埋めて送信ボタンを押す。 */
	async function submit() {
		await page.getByLabelText('メールアドレス').fill('a@example.com');
		await page.getByLabelText('パスワード').fill('password123');
		await page.getByRole('button', { name: 'ログイン' }).click();
	}

	it('送信後にパスワード欄をクリアする', async () => {
		await render(LoginPage, { form: null, data: data() });

		await submit();

		await expect.element(page.getByLabelText('パスワード')).toHaveValue('');
	});

	it('送信時にフォームの再描画を要求する', async () => {
		updateCalls.mockClear();
		await render(LoginPage, { form: null, data: data() });

		await submit();

		await vi.waitFor(() => expect(updateCalls).toHaveBeenCalledOnce());
	});

	it('送信が終わればボタンを押せる状態に戻す', async () => {
		await render(LoginPage, { form: null, data: data() });

		await submit();

		await expect.element(page.getByRole('button', { name: 'ログイン' })).toBeEnabled();
	});
});
