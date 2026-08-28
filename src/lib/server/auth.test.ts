import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// issue #62: auth.ts の環境変数による分岐の単体テスト。
// Better Auth本体・DB接続は初期化させず、渡された設定だけを検証する。
// 環境変数ごとにモジュール評価をやり直すため vi.resetModules() + 動的importで読み込む。

const { mockEnv, betterAuth, drizzleAdapter, sveltekitCookies } = vi.hoisted(() => ({
	mockEnv: {} as Record<string, string | undefined>,
	betterAuth: vi.fn((config: unknown) => ({ config })),
	drizzleAdapter: vi.fn(() => 'drizzle-adapter'),
	sveltekitCookies: vi.fn(() => 'sveltekit-cookies-plugin')
}));

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('better-auth', () => ({ betterAuth }));
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter }));
vi.mock('better-auth/svelte-kit', () => ({ sveltekitCookies }));
vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('$lib/server/db', () => ({ db: {} }));

/** 環境変数を差し替えてauth.tsを評価し直す。 */
async function importAuth(env: Record<string, string | undefined>) {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
	Object.assign(mockEnv, env);
	vi.resetModules();
	return import('./auth');
}

/** betterAuth()へ渡された設定を取り出す。 */
function passedConfig() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return betterAuth.mock.calls.at(-1)![0] as any;
}

const REQUIRED = {
	BETTER_AUTH_SECRET: 'test-secret',
	BETTER_AUTH_URL: 'http://localhost:5173'
};

beforeEach(() => {
	betterAuth.mockClear();
});

afterEach(() => {
	vi.resetModules();
});

describe('必須環境変数の検証', () => {
	it('BETTER_AUTH_SECRETが未設定なら起動時にthrowする', async () => {
		await expect(importAuth({ BETTER_AUTH_URL: REQUIRED.BETTER_AUTH_URL })).rejects.toThrow(
			'BETTER_AUTH_SECRET is not set'
		);
	});

	it('BETTER_AUTH_URLが未設定なら起動時にthrowする', async () => {
		await expect(importAuth({ BETTER_AUTH_SECRET: REQUIRED.BETTER_AUTH_SECRET })).rejects.toThrow(
			'BETTER_AUTH_URL is not set'
		);
	});

	it('必須環境変数が揃っていれば初期化できる', async () => {
		const { auth } = await importAuth(REQUIRED);

		expect(auth).toBeDefined();
		expect(passedConfig().secret).toBe('test-secret');
		expect(passedConfig().baseURL).toBe('http://localhost:5173');
	});
});

describe('Googleプロバイダの有効・無効', () => {
	it('クライアントID/シークレットが揃えば有効になる', async () => {
		const { isGoogleAuthEnabled } = await importAuth({
			...REQUIRED,
			GOOGLE_CLIENT_ID: 'client-id',
			GOOGLE_CLIENT_SECRET: 'client-secret'
		});

		expect(isGoogleAuthEnabled).toBe(true);
		expect(passedConfig().socialProviders.google).toEqual({
			clientId: 'client-id',
			clientSecret: 'client-secret'
		});
	});

	it.each([
		['両方未設定', {}],
		['IDのみ設定', { GOOGLE_CLIENT_ID: 'client-id' }],
		['シークレットのみ設定', { GOOGLE_CLIENT_SECRET: 'client-secret' }],
		['IDが空文字', { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'client-secret' }],
		['シークレットが空文字', { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: '' }]
	])('%s ならthrowせずプロバイダ登録をスキップする', async (_label, googleEnv) => {
		const { isGoogleAuthEnabled, auth } = await importAuth({ ...REQUIRED, ...googleEnv });

		expect(isGoogleAuthEnabled).toBe(false);
		expect(auth).toBeDefined();
		expect(passedConfig().socialProviders.google).toBeUndefined();
	});
});

describe('Better Authへ渡す設定', () => {
	beforeEach(async () => {
		await importAuth(REQUIRED);
	});

	it('email/password認証を有効にする', () => {
		expect(passedConfig().emailAndPassword).toEqual({
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 255,
			autoSignIn: true
		});
	});

	it('同一メールの自動アカウントリンクを有効にする', () => {
		expect(passedConfig().account.accountLinking).toEqual({
			enabled: true,
			requireLocalEmailVerified: false,
			trustedProviders: ['google']
		});
	});

	it('セッションを30日・15日でスライド延長する', () => {
		expect(passedConfig().session).toEqual({
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24 * 15
		});
	});

	it('DrizzleアダプタをMySQLで構成する', () => {
		expect(drizzleAdapter).toHaveBeenCalledWith({}, { provider: 'mysql' });
		expect(passedConfig().database).toBe('drizzle-adapter');
	});

	it('SvelteKitのCookie転送プラグインを登録する', () => {
		expect(passedConfig().plugins).toEqual(['sveltekit-cookies-plugin']);
	});
});
