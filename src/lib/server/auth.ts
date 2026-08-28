import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { env } from '$env/dynamic/private';

if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set');
if (!env.BETTER_AUTH_URL) throw new Error('BETTER_AUTH_URL is not set');

// issue #49: issue #3の自前実装（Cookie+DBセッション、argon2id）をBetter Authへ移行。
// email/passwordのみを有効化し、OAuth・メール送信・プラグイン等は設定しない（#42/#44/#45のスコープ）。
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'mysql'
	}),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 255,
		autoSignIn: true
	},
	session: {
		// 既存の「30日・残り15日でスライド延長」に近い体験を維持する。
		// Better Authのslide-window方式（updateAgeより古いセッションへのアクセスでexpiresInぶん再延長）
		// はセマンティクスが異なるため完全一致は求めない（spec.md 2-3）。
		expiresIn: 60 * 60 * 24 * 30, // 30日
		updateAge: 60 * 60 * 24 * 15 // 15日経過でスライド延長
	},
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	// Form Action（サーバーサイドのauth.api.*呼び出し）からのセッションCookieを
	// SvelteKitのレスポンスへ確実に転送するための公式プラグイン（spec.md 2-5の注意事項対応）。
	plugins: [sveltekitCookies(getRequestEvent)]
});
