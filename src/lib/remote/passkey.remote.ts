import { command, getRequestEvent } from '$app/server';
import { verifyPasskeySchema } from '#lib/schemas/passkey.js';
import {
	startPasskeyLogin as startLogin,
	startPasskeyRegistration as startRegistration,
	verifyPasskeyLogin as verifyLogin,
	verifyPasskeyRegistration as verifyRegistration
} from '#lib/server/passkey.js';

// パスキーの登録・ログイン（Supabase Auth を呼び、セッションの Cookie を書く）。すべて command（POST）。
// 入出力の形は contracts/auth.md。

export const startPasskeyRegistration = command(() => {
	const { locals } = getRequestEvent();
	return startRegistration(locals.supabase, locals.user);
});

export const verifyPasskeyRegistration = command(verifyPasskeySchema, (input) => {
	const { locals } = getRequestEvent();
	return verifyRegistration(locals.supabase, locals.user, input);
});

export const startPasskeyLogin = command(() => {
	const { locals } = getRequestEvent();
	return startLogin(locals.supabase);
});

export const verifyPasskeyLogin = command(verifyPasskeySchema, (input) => {
	const { locals } = getRequestEvent();
	return verifyLogin(locals.supabase, input);
});
