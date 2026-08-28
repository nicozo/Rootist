import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { env } from '$env/dynamic/private';

if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set');
if (!env.BETTER_AUTH_URL) throw new Error('BETTER_AUTH_URL is not set');

// issue #42: Googleログイン。GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRETは他の必須環境変数と異なり
// throwしない（Google Cloud Console側の発行はユーザーの別途対応であり、未発行の間もローカル開発・
// CI・既存のemail/password認証を止めないため）。socialProviders.googleにundefinedを渡すと
// Better Authランタイム（node_modules/better-auth/dist/context/create-context.mjs）が
// `config == null` の分岐でプロバイダ自体を登録せずスキップすることを実ソースで確認済み。
const googleClientId = env.GOOGLE_CLIENT_ID;
const googleClientSecret = env.GOOGLE_CLIENT_SECRET;
export const isGoogleAuthEnabled = Boolean(googleClientId && googleClientSecret);

// issue #49: issue #3の自前実装（Cookie+DBセッション、argon2id）をBetter Authへ移行。
// email/passwordを有効化し、issue #42でGoogleソーシャルログインを追加した
// （メール送信・その他プラグイン等は#44/#45のスコープ外のため設定しない）。
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
	// issue #42: Googleプロバイダ。未設定時はundefinedを渡し登録自体をスキップする（上記コメント参照）。
	// スコープは追加設定しない（Better Authデフォルトのemail/profile/openidのみ。不変条件6）。
	socialProviders: {
		google: isGoogleAuthEnabled
			? {
					clientId: googleClientId as string,
					clientSecret: googleClientSecret as string
				}
			: undefined
	},
	account: {
		accountLinking: {
			enabled: true,
			// 「同一メールのGoogleログインは既存email/passwordユーザーへ自動リンクする」方針（spec.md 2-1(3)）。
			// GoogleはtrustedProviderかつemail_verified:trueを返すため通常はこれで足りるが、
			// Better Authランタイム（node_modules/.../@better-auth/core/src/types/init-options.ts、
			// dist/oauth2/link-account.mjs）を確認したところ、`requireLocalEmailVerified`
			// （既定true）が別途「既存ローカルユーザーのemailVerifiedがtrueであること」も要求しており、
			// rootistの既存email/passwordユーザーはメール確認未実装（#45未着手）のためemailVerified
			// は常にfalseで、既定のままでは自動リンクが常に "account not linked" で失敗する。
			// spec.md 2-1(3)で明記された既知リスク（メール確認未実装ゆえのpre-account-takeover経路）
			// を許容する前提のもと、自動リンクを実現するため明示的にfalseへ上書きする。
			requireLocalEmailVerified: false,
			trustedProviders: ['google']
		}
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
