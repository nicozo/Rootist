import { describe, expect, it, vi, beforeEach } from 'vite-plus/test';
import { readFileSync } from 'node:fs';

// issue #116: リクエストごとのSupabaseサーバー用クライアント生成の単体テスト。
// @supabase/ssr と環境変数はモックし、ネットワークには出ない。

const { createServerClient, env } = vi.hoisted(() => ({
	createServerClient: vi.fn(),
	env: {} as Record<string, string | undefined>
}));

vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('$env/dynamic/private', () => ({ env }));

// 文字列そのものをリポジトリ全体のgrep検証（src内0件）に掛けないため分割して組み立てる
const SECRET_KEY_NAME = 'SUPABASE_SECRET' + '_KEY';

async function load() {
	vi.resetModules();
	return import('./supabase');
}

type CookieMethods = {
	getAll: () => { name: string; value: string }[];
	setAll: (
		cookies: { name: string; value: string; options: Record<string, unknown> }[],
		headers: Record<string, string>
	) => void;
};

function fakeEvent() {
	const jar = [{ name: 'sb-x-auth-token', value: 'v' }];
	return {
		cookies: { getAll: vi.fn(() => jar), set: vi.fn() },
		setHeaders: vi.fn()
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

async function makeClient(event = fakeEvent()) {
	const mod = await load();
	mod.createSupabaseClient(event);
	const methods = createServerClient.mock.calls.at(-1)![2].cookies as CookieMethods;
	return { event, methods, mod };
}

beforeEach(() => {
	createServerClient.mockReset();
	createServerClient.mockReturnValue({ auth: {} });
	env.SUPABASE_URL = 'https://example.supabase.co';
	env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
	delete env[SECRET_KEY_NAME];
});

describe('環境変数', () => {
	it.each([undefined, ''])('SUPABASE_URL が %j ならモジュール読込時に throw する', async (v) => {
		env.SUPABASE_URL = v;
		await expect(load()).rejects.toThrow('SUPABASE_URL is not set');
	});

	it.each([undefined, ''])(
		'SUPABASE_PUBLISHABLE_KEY が %j ならモジュール読込時に throw する',
		async (v) => {
			env.SUPABASE_PUBLISHABLE_KEY = v;
			await expect(load()).rejects.toThrow('SUPABASE_PUBLISHABLE_KEY is not set');
		}
	);

	it('URL とキーをクライアント生成に渡す', async () => {
		await makeClient();
		expect(createServerClient.mock.calls[0][0]).toBe('https://example.supabase.co');
		expect(createServerClient.mock.calls[0][1]).toBe('publishable-key');
	});

	it('Secret key（管理者権限）の環境変数を参照しない', () => {
		const src = readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8');
		expect(src).not.toContain(SECRET_KEY_NAME);
	});
});

describe('isGoogleAuthEnabled', () => {
	it('#117まで常に false（GOOGLE_CLIENT_* があっても）', async () => {
		env.GOOGLE_CLIENT_ID = 'id';
		env.GOOGLE_CLIENT_SECRET = 'secret';
		const { isGoogleAuthEnabled } = await load();
		expect(isGoogleAuthEnabled).toBe(false);
	});
});

describe('リクエストごとのクライアント', () => {
	it('呼ぶたびに新しいクライアントを作る（共有しない）', async () => {
		const mod = await load();
		mod.createSupabaseClient(fakeEvent());
		mod.createSupabaseClient(fakeEvent());
		expect(createServerClient).toHaveBeenCalledTimes(2);
	});
});

describe('cookies.getAll', () => {
	it('event.cookies.getAll を使う', async () => {
		const { methods, event } = await makeClient();
		expect(methods.getAll()).toEqual([{ name: 'sb-x-auth-token', value: 'v' }]);
		expect(event.cookies.getAll).toHaveBeenCalled();
	});
});

describe('cookies.setAll', () => {
	it('path:/ と HttpOnly を付けて書き込む（ライブラリ側のhttpOnly:falseを上書き）', async () => {
		const { methods, event } = await makeClient();
		methods.setAll(
			[
				{
					name: 'sb-x-auth-token.0',
					value: 'abc',
					options: { path: '/other', httpOnly: false, maxAge: 100, sameSite: 'lax' }
				}
			],
			{}
		);
		expect(event.cookies.set).toHaveBeenCalledWith('sb-x-auth-token.0', 'abc', {
			path: '/',
			httpOnly: true,
			maxAge: 100,
			sameSite: 'lax'
		});
	});

	it('secure が undefined / false のときは secure キーを渡さない（SvelteKitの既定を上書きしない）', async () => {
		const { methods, event } = await makeClient();
		methods.setAll(
			[
				{ name: 'a', value: '1', options: { secure: undefined } },
				{ name: 'b', value: '2', options: { secure: false } }
			],
			{}
		);
		for (const call of event.cookies.set.mock.calls) {
			expect('secure' in call[2]).toBe(false);
		}
	});

	it('secure:true は保持する', async () => {
		const { methods, event } = await makeClient();
		methods.setAll([{ name: 'a', value: '1', options: { secure: true } }], {});
		expect(event.cookies.set.mock.calls[0][2].secure).toBe(true);
	});

	it('SameSite は未指定なら lax にする', async () => {
		const { methods, event } = await makeClient();
		methods.setAll([{ name: 'a', value: '1', options: {} }], {});
		expect(event.cookies.set.mock.calls[0][2].sameSite).toBe('lax');
	});

	it('キャッシュ制御ヘッダーをレスポンスに反映する', async () => {
		const { methods, event } = await makeClient();
		const headers = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' };
		methods.setAll([{ name: 'a', value: '1', options: {} }], headers);
		expect(event.setHeaders).toHaveBeenCalledWith(headers);
	});

	it('同じ event で setAll を2回呼んでも throw せず、setHeaders は1回だけ', async () => {
		const { methods, event } = await makeClient();
		// SvelteKitの実挙動に合わせ、2回目のsetHeadersは例外にする
		let called = 0;
		event.setHeaders.mockImplementation(() => {
			if (++called > 1) throw new Error('"cache-control" header is already set');
		});
		const headers = { 'Cache-Control': 'private, no-store' };
		expect(() => {
			methods.setAll([{ name: 'a', value: '1', options: {} }], headers);
			methods.setAll([{ name: 'a', value: '2', options: {} }], headers);
		}).not.toThrow();
		expect(event.setHeaders).toHaveBeenCalledTimes(1);
		expect(event.cookies.set).toHaveBeenCalledTimes(2);
	});

	it('ヘッダーが空のときは setHeaders を呼ばない', async () => {
		const { methods, event } = await makeClient();
		methods.setAll([{ name: 'a', value: '1', options: {} }], {});
		expect(event.setHeaders).not.toHaveBeenCalled();
	});
});
