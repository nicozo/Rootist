import { describe, expect, it, vi, afterEach } from 'vite-plus/test';

// issue #115: DB接続モジュールの単体テスト。
// 実際のPostgresへは接続せず、postgres.jsのクライアント生成とdrizzleの初期化呼び出しだけを検証する。
// 環境変数ごとにモジュール評価をやり直すため vi.resetModules() + 動的importで読み込む。

const { mockEnv, queryClient, postgres, drizzle } = vi.hoisted(() => {
	// タグ付きテンプレートとして呼ばれる=クエリ実行。import時に呼ばれていないことを検証するために使う
	const queryClient = vi.fn();
	return {
		mockEnv: {} as Record<string, string | undefined>,
		queryClient,
		postgres: vi.fn<(...args: unknown[]) => unknown>(() => queryClient),
		drizzle: vi.fn<(...args: unknown[]) => unknown>(() => 'drizzle-db')
	};
});

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('postgres', () => ({ default: postgres }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle }));

const URL_FOR_TEST = 'postgresql://user:pass@localhost:5432/rootist';

/** 環境変数を差し替えてdb/index.tsを評価し直す。 */
async function importDb(env: Record<string, string | undefined>) {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
	Object.assign(mockEnv, env);
	vi.resetModules();
	postgres.mockClear();
	drizzle.mockClear();
	queryClient.mockClear();
	return import('./index');
}

afterEach(() => {
	vi.resetModules();
});

describe('DB接続の初期化', () => {
	it('DATABASE_URLが未設定なら起動時にthrowする', async () => {
		await expect(importDb({})).rejects.toThrow('DATABASE_URL is not set');
		expect(postgres).not.toHaveBeenCalled();
	});

	it('DATABASE_URLが空文字でも起動時にthrowする', async () => {
		await expect(importDb({ DATABASE_URL: '' })).rejects.toThrow('DATABASE_URL is not set');
	});

	it('DATABASE_URLからpostgres.jsのクライアントを作りDrizzleを初期化する', async () => {
		const { db } = await importDb({ DATABASE_URL: URL_FOR_TEST });

		expect(postgres).toHaveBeenCalledWith(URL_FOR_TEST, expect.any(Object));
		expect(drizzle).toHaveBeenCalledWith(queryClient, expect.any(Object));
		expect(db).toBe('drizzle-db');
	});

	it('接続数の上限とアイドル接続の解放を設定する（Session poolerのクライアント数上限対策）', async () => {
		const { POOL_OPTIONS } = await importDb({ DATABASE_URL: URL_FOR_TEST });

		const [, options] = postgres.mock.calls[0] as unknown as [string, Record<string, unknown>];
		expect(options).toMatchObject({
			max: POOL_OPTIONS.max,
			idle_timeout: POOL_OPTIONS.idle_timeout
		});
		expect(POOL_OPTIONS.max).toBeLessThanOrEqual(5);
		expect(POOL_OPTIONS.idle_timeout).toBeGreaterThan(0);
	});

	it('旧DB用のmodeオプションをDrizzleへ渡さない', async () => {
		await importDb({ DATABASE_URL: URL_FOR_TEST });

		const [, options] = drizzle.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
		expect(options).not.toHaveProperty('mode');
	});

	it('スキーマ定義をDrizzleへ渡す', async () => {
		await importDb({ DATABASE_URL: URL_FOR_TEST });

		const [, options] = drizzle.mock.calls[0] as unknown as [unknown, { schema: object }];
		expect(options.schema).toHaveProperty('plans');
		expect(options.schema).toHaveProperty('user');
	});

	it('import時点ではクエリも接続も行わない（CIのダミーURLでも起動できる）', async () => {
		await importDb({ DATABASE_URL: URL_FOR_TEST });

		expect(queryClient).not.toHaveBeenCalled();
	});
});
