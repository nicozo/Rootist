import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { normalizeEmail, LOGIN_FAILURE_MESSAGE } from '$lib/server/auth-errors';

// ログイン済みユーザーが /login にアクセスしたら /plan へリダイレクトする
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/plan');
	}
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const rawEmail = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');

		const email = normalizeEmail(rawEmail);

		// メール不存在・誤パスワード・形式不備のいずれも区別せず、Better Authが投げるエラーを
		// すべて同一の統一メッセージに変換する（不変条件3: アカウント存在推測の抑制）。
		// タイミング攻撃緩和（ダミーhash verify）はBetter Authの内部実装に委ねる（spec.md 2-8）ため、
		// ここで早期returnによるショートカットは行わない。
		try {
			await auth.api.signInEmail({ body: { email, password } });
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: LOGIN_FAILURE_MESSAGE, email: rawEmail });
			}
			throw err;
		}

		redirect(303, '/plan');
	}
};
