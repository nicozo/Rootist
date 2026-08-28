import { redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';

// issue #42: Googleログイン開始用の専用ルート。
// SvelteKitは同一ページでdefaultアクションと名前付きアクションを混在できないため、
// 既存の/login・/registerのdefaultアクションを一切変更せずに済むよう専用ルートを新設する
// （spec.md 2-2）。GETアクセスは/logoutと同じPOST専用パターンで/loginへ303リダイレクトする。
export const load: PageServerLoad = async () => {
	redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ request }) => {
		// redirect()は例外を投げるため、実際に呼ぶのはtry/catchの外で行う
		// （catch (err instanceof APIError) にredirectの内部例外を誤って捕捉させないため）。
		let authorizationUrl: string | null = null;

		try {
			// auth.api.signInSocial は google プロバイダが未登録（環境変数未設定）の場合、
			// APIError(NOT_FOUND, PROVIDER_NOT_FOUND) を投げる
			// （node_modules/better-auth/dist/api/routes/sign-in.mjs で確認済み）。
			// signInSocial自体はformCsrfMiddlewareを使わず、生成したstate/codeVerifierの
			// CookieはsveltekitCookies(getRequestEvent)プラグインがevent.cookiesへ転送する。
			const result = await auth.api.signInSocial({
				body: {
					provider: 'google',
					callbackURL: '/plan',
					errorCallbackURL: '/login'
				},
				headers: request.headers
			});
			authorizationUrl = result.url ?? null;
		} catch (err) {
			if (err instanceof APIError) {
				// プロバイダ未登録（環境変数未設定）・その他Better Auth側のエラー。
				// 500を露出させず/login?error=googleへ退避する（spec.md 2-2）。
				console.error('auth/google action: signInSocial APIError', err.body?.code ?? err.message);
				redirect(303, '/login?error=google');
			}
			throw err;
		}

		if (!authorizationUrl) {
			// 理論上到達しない（disableRedirect未指定・idToken未指定のためurlは必ず返る）が、
			// 万一urlが空の場合も500を露出させず/login?error=googleへ退避する。
			console.error('auth/google action: signInSocial returned no url');
			redirect(303, '/login?error=google');
		}

		redirect(303, authorizationUrl);
	}
};
