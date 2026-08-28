import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import {
	normalizeEmail,
	validateEmail,
	validatePassword,
	LOGIN_FAILURE_MESSAGE
} from '$lib/server/auth/validation';
import { verifyPassword, verifyAgainstDummyHash } from '$lib/server/auth/password';
import { generateSessionToken } from '$lib/server/auth/session';
import { createSession } from '$lib/server/auth/session-store';
import { setSessionCookie } from '$lib/server/auth/cookies';

// ログイン済みユーザーが /login にアクセスしたら /plan へリダイレクトする
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/plan');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const rawEmail = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');

		const email = normalizeEmail(rawEmail);

		// メール形式・パスワード長のフォーマット不備も、存在しないメールと同じ統一メッセージにする
		// （不変条件4: アカウント存在推測の抑制。フォーマットエラーで応答を分岐させない）
		const emailResult = validateEmail(email);
		const passwordResult = validatePassword(password);
		if (!emailResult.ok || !passwordResult.ok) {
			await verifyAgainstDummyHash(password);
			return fail(400, { message: LOGIN_FAILURE_MESSAGE, email: rawEmail });
		}

		const rows = await db
			.select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
			.from(users)
			.where(eq(users.email, email));
		const user = rows[0];

		if (!user) {
			// タイミング攻撃緩和: メール不存在時もダミーハッシュに対してverify()を実行する
			await verifyAgainstDummyHash(password);
			return fail(400, { message: LOGIN_FAILURE_MESSAGE, email: rawEmail });
		}

		const valid = await verifyPassword(user.passwordHash, password);
		if (!valid) {
			return fail(400, { message: LOGIN_FAILURE_MESSAGE, email: rawEmail });
		}

		const token = generateSessionToken();
		await createSession(token, user.id);
		setSessionCookie(cookies, token);

		redirect(303, '/plan');
	}
};
