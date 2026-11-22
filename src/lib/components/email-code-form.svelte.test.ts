import { page } from 'vite-plus/test/browser';
import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

// issue #189: メールのコード入力フォーム（メール入力 ⇄ コード入力）の表示テスト。
// use:enhance は本来サーバーの form action へ fetch するため、何もしない版に差し替える。
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));

const EmailCodeForm = (await import('./email-code-form.svelte')).default;

const CODE_STEP = { step: 'code', email: 'a@example.com' } as const;

describe('メールアドレスの入力（step: email）', () => {
	it('FR-001: メールアドレス欄と「コードを送る」だけを表示し、パスワード欄は無い', async () => {
		const { container } = await render(EmailCodeForm, { form: null });

		await expect.element(page.getByLabelText('メールアドレス')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'コードを送る' })).toBeInTheDocument();
		expect(container.querySelector('input[type="password"]')).toBeNull();
		expect(container.textContent).not.toContain('パスワード');
	});

	it('メール欄は type=email・autocomplete=email・必須で、?/sendCode に POST する', async () => {
		const { container } = await render(EmailCodeForm, { form: null });

		const input = container.querySelector('input[name="email"]');
		expect(input?.getAttribute('type')).toBe('email');
		expect(input?.getAttribute('autocomplete')).toBe('email');
		expect(input?.hasAttribute('required')).toBe(true);
		const form = container.querySelector('form[action="?/sendCode"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
	});

	it('エラーが無ければアラートを表示しない', async () => {
		const { container } = await render(EmailCodeForm, { form: null });

		expect(container.querySelector('[data-slot="alert"]')).toBeNull();
	});

	it('FR-011: 形式エラーのメッセージを表示し、入力したメールを復元する', async () => {
		await render(EmailCodeForm, {
			form: { step: 'email', message: 'メールアドレスの形式が正しくありません', email: 'bad' }
		});

		await expect
			.element(page.getByText('メールアドレスの形式が正しくありません'))
			.toBeInTheDocument();
		await expect.element(page.getByLabelText('メールアドレス')).toHaveValue('bad');
	});

	it('FR-023: 回数制限のメッセージを表示する', async () => {
		await render(EmailCodeForm, {
			form: {
				step: 'email',
				message: '試行回数が多すぎます。しばらく時間をおいてからもう一度お試しください。',
				email: 'a@example.com'
			}
		});

		await expect
			.element(
				page.getByText('試行回数が多すぎます。しばらく時間をおいてからもう一度お試しください。')
			)
			.toBeInTheDocument();
	});
});

describe('コードの入力（step: code）', () => {
	it('FR-004: 送り先のメールアドレスを示す', async () => {
		await render(EmailCodeForm, { form: CODE_STEP });

		await expect
			.element(page.getByText(/a@example\.com.*宛てにコードを送りました/))
			.toBeInTheDocument();
	});

	it('コード欄は数字キーボード・ワンタイムコードの自動入力・6 桁・必須', async () => {
		const { container } = await render(EmailCodeForm, { form: CODE_STEP });

		await expect.element(page.getByLabelText('6桁のコード')).toBeInTheDocument();
		const input = container.querySelector('input[name="code"]');
		expect(input?.getAttribute('inputmode')).toBe('numeric');
		expect(input?.getAttribute('autocomplete')).toBe('one-time-code');
		expect(input?.getAttribute('maxlength')).toBe('6');
		expect(input?.hasAttribute('required')).toBe(true);
	});

	it('コードの確認は ?/verifyCode に、送り先のメールを隠し項目で添えて POST する', async () => {
		const { container } = await render(EmailCodeForm, { form: CODE_STEP });

		await expect
			.element(page.getByRole('button', { name: 'コードを確認する' }))
			.toBeInTheDocument();
		const form = container.querySelector('form[action="?/verifyCode"]');
		expect(form?.getAttribute('method')?.toUpperCase()).toBe('POST');
		const hidden = form?.querySelector('input[name="email"]') as HTMLInputElement | null;
		expect(hidden?.value).toBe('a@example.com');
	});

	it('FR-009, FR-010: 「コードを再送する」は ?/sendCode に再送の印（resend）と送り先を添えて POST する', async () => {
		const { container } = await render(EmailCodeForm, { form: CODE_STEP });

		const button = page.getByRole('button', { name: 'コードを再送する' });
		await expect.element(button).toBeInTheDocument();
		const form = container.querySelector('form[action="?/sendCode"]');
		expect(form?.querySelector('button')?.textContent).toContain('コードを再送する');
		expect((form?.querySelector('input[name="email"]') as HTMLInputElement).value).toBe(
			'a@example.com'
		);
		expect((form?.querySelector('input[name="resend"]') as HTMLInputElement).value).toBe('1');
	});

	it('FR-008: 誤ったコードのメッセージを表示し、コード入力の画面のまま', async () => {
		await render(EmailCodeForm, {
			form: {
				step: 'code',
				message:
					'コードが正しくないか、期限が切れています。入力し直すか、コードを再送してください。',
				email: 'a@example.com'
			}
		});

		await expect
			.element(page.getByText(/コードが正しくないか、期限が切れています/))
			.toBeInTheDocument();
		await expect.element(page.getByLabelText('6桁のコード')).toBeInTheDocument();
	});

	it('「メールアドレスを変える」でメール入力に戻り、前のメールアドレスが入っている', async () => {
		await render(EmailCodeForm, { form: CODE_STEP });

		await page.getByRole('button', { name: 'メールアドレスを変える' }).click();

		await expect.element(page.getByLabelText('メールアドレス')).toHaveValue('a@example.com');
		await expect.element(page.getByRole('button', { name: 'コードを送る' })).toBeInTheDocument();
	});
});
