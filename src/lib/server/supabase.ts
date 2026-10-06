import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, GOOGLE_AUTH_ENABLED } from '$app/env/private';

if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set');
if (!SUPABASE_PUBLISHABLE_KEY) throw new Error('SUPABASE_PUBLISHABLE_KEY is not set');

const supabaseUrl = SUPABASE_URL;
const supabasePublishableKey = SUPABASE_PUBLISHABLE_KEY;

// /login・/registerのGoogleボタン表示フラグ（issue #117）。Googleの認証情報はSupabaseダッシュボード側に
// 登録するためアプリからは設定の有無を判定できない。ダッシュボードで設定済みの環境だけ
// GOOGLE_AUTH_ENABLED=true にする（未設定ならボタンを出さず、email/passwordは影響を受けない）。
export const isGoogleAuthEnabled = GOOGLE_AUTH_ENABLED === 'true';

/** リクエストごとに作るSupabaseサーバー用クライアント（モジュール全体で共有しない） */
export type SupabaseServerClient = SupabaseClient;

/**
 * リクエスト専用のSupabaseサーバー用クライアントを作る。ユーザー間でセッションが混ざらないよう
 * 必ずリクエストごとに呼ぶ（I-6）。セッションはSupabaseのCookieで持ち、読み書きは event.cookies 経由。
 * 認証Cookieはブラウザ用クライアントを作らないためHttpOnlyにする（I-5）。
 */
export function createSupabaseClient(
	event: Pick<RequestEvent, 'cookies' | 'setHeaders'>
): SupabaseServerClient {
	// @supabase/ssrは最初のCookie書込時にCache-Control等を渡してくる。SvelteKitのsetHeadersは
	// 同じヘッダーを2回設定すると例外を投げる（=500）ため、このクライアント内では1回しか反映しない。
	let headersApplied = false;

	return createServerClient(supabaseUrl, supabasePublishableKey, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet, headers) => {
				for (const { name, value, options } of cookiesToSet) {
					const { secure, ...rest } = options;
					event.cookies.set(name, value, {
						sameSite: 'lax',
						...rest,
						// secureはtrueのときだけ渡す。undefined/falseの明示でSvelteKitの既定
						// （localhost以外のhttpではSecureを付ける）を上書きしない
						...(secure ? { secure } : {}),
						path: '/',
						httpOnly: true
					});
				}
				if (!headersApplied && Object.keys(headers).length > 0) {
					headersApplied = true;
					// 認証Cookieを含むレスポンスが共有キャッシュに載らないようにする
					event.setHeaders(headers);
				}
			}
		}
	});
}
