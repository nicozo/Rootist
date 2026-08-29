import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

// issue #62: 新規登録ページの表示テスト。
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
				action: new URL('http://localhost/register'),
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

const RegisterPage = (await import('./+page.svelte')).default;

/** loadが返すdataの既定値。 */
function data(overrides: Record<string, unknown> = {}) {
	return { user: null, googleAuthEnabled: false, ...overrides };
}

describe('/register +page.svelte', () => {
	it('見出しと説明を表示する', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await expect
			.element(page.getByRole('heading', { level: 1, name: '新規登録' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('メールアドレスとパスワードでアカウントを作成します。'))
			.toBeInTheDocument();
	});

	it('メールとパスワードの入力欄をラベル付きで表示する', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await expect.element(page.getByLabelText('メールアドレス')).toBeInTheDocument();
		await expect.element(page.getByLabelText('パスワード')).toBeInTheDocument();
	});

	it('パスワードの最低文字数を案内し入力欄にも制約を付ける', async () => {
		const { container } = await render(RegisterPage, { form: null, data: data() });

		await expect.element(page.getByText('8文字以上で入力してください。')).toBeInTheDocument();
		expect(container.querySelector('#password')?.getAttribute('minlength')).toBe('8');
	});

	it('エラーが無ければアラートを表示しない', async () => {
		const { container } = await render(RegisterPage, { form: null, data: data() });

		expect(container.querySelector('[data-slot="alert"]')).toBeNull();
	});

	it('登録失敗のメッセージを表示する', async () => {
		await render(RegisterPage, {
			form: { message: 'このメールアドレスは既に登録されています', email: 'dup@example.com' },
			data: data()
		});

		await expect
			.element(page.getByText('このメールアドレスは既に登録されています'))
			.toBeInTheDocument();
	});

	it('失敗時は入力されたメールを復元する', async () => {
		await render(RegisterPage, {
			form: { message: 'エラー', email: 'dup@example.com' },
			data: data()
		});

		await expect.element(page.getByLabelText('メールアドレス')).toHaveValue('dup@example.com');
	});

	it('失敗時もパスワードは復元しない', async () => {
		await render(RegisterPage, {
			form: { message: 'エラー', email: 'dup@example.com' },
			data: data()
		});

		await expect.element(page.getByLabelText('パスワード')).toHaveValue('');
	});

	it('Googleログインが無効ならボタンを表示しない', async () => {
		const { container } = await render(RegisterPage, {
			form: null,
			data: data({ googleAuthEnabled: false })
		});

		expect(container.textContent).not.toContain('Googleで登録');
		expect(container.querySelector('form[action="/auth/google"]')).toBeNull();
	});

	it('Googleログインが有効ならPOST /auth/google のボタンを表示する', async () => {
		const { container } = await render(RegisterPage, {
			form: null,
			data: data({ googleAuthEnabled: true })
		});

		await expect.element(page.getByRole('button', { name: /Googleで登録/ })).toBeInTheDocument();
		const form = container.querySelector('form[action="/auth/google"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
	});

	it('ログインページへのリンクを表示する', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await expect.element(page.getByRole('link', { name: 'ログイン' })).toBeInTheDocument();
	});
});

describe('/register 送信中の挙動', () => {
	/** メールとパスワードを埋めて送信ボタンを押す。 */
	async function submit() {
		await page.getByLabelText('メールアドレス').fill('new@example.com');
		await page.getByLabelText('パスワード').fill('password123');
		await page.getByRole('button', { name: '新規登録' }).click();
	}

	it('送信後にパスワード欄をクリアする', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await submit();

		await expect.element(page.getByLabelText('パスワード')).toHaveValue('');
	});

	it('送信時にフォームの再描画を要求する', async () => {
		updateCalls.mockClear();
		await render(RegisterPage, { form: null, data: data() });

		await submit();

		await vi.waitFor(() => expect(updateCalls).toHaveBeenCalledOnce());
	});

	it('送信が終わればボタンを押せる状態に戻す', async () => {
		await render(RegisterPage, { form: null, data: data() });

		await submit();

		await expect.element(page.getByRole('button', { name: '新規登録' })).toBeEnabled();
	});
});
