import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import {
	normalizeEmail,
	validateEmail,
	validatePassword,
	DUPLICATE_EMAIL_MESSAGE
} from '$lib/server/auth/validation';
import { hashPassword } from '$lib/server/auth/password';
import { generateSessionToken } from '$lib/server/auth/session';
import { createSession } from '$lib/server/auth/session-store';
import { setSessionCookie } from '$lib/server/auth/cookies';

// ログイン済みユーザーが /register にアクセスしたら /plan へリダイレクトする
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

		const emailResult = validateEmail(email);
		if (!emailResult.ok) {
			return fail(400, { message: emailResult.message, email: rawEmail });
		}

		const passwordResult = validatePassword(password);
		if (!passwordResult.ok) {
			return fail(400, { message: passwordResult.message, email: rawEmail });
		}

		const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
		if (existing.length > 0) {
			return fail(400, { message: DUPLICATE_EMAIL_MESSAGE, email: rawEmail });
		}

		const passwordHash = await hashPassword(password);

		let userId: number;
		try {
			const [inserted] = await db.insert(users).values({ email, passwordHash }).$returningId();
			userId = inserted.id;
		} catch {
			// UNIQUE制約違反（事前SELECTと登録の間のレースコンディション）を同じエラーに変換する
			return fail(400, { message: DUPLICATE_EMAIL_MESSAGE, email: rawEmail });
		}

		// 登録成功時はそのままログイン状態にする（登録→再ログインの二度手間を課さない）
		const token = generateSessionToken();
		await createSession(token, userId);
		setSessionCookie(cookies, token);

		redirect(303, '/plan');
	}
};
