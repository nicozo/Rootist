import { describe, expect, it, vi, afterEach } from 'vitest';

// issue #62: DB接続モジュールの単体テスト。
// 実際のMySQLへは接続せず、mysql2のプール生成とdrizzleの初期化呼び出しだけを検証する。
// 環境変数ごとにモジュール評価をやり直すため vi.resetModules() + 動的importで読み込む。

const { mockEnv, createPool, drizzle } = vi.hoisted(() => ({
	mockEnv: {} as Record<string, string | undefined>,
	createPool: vi.fn(() => 'mysql-pool'),
	drizzle: vi.fn(() => 'drizzle-db')
}));

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('mysql2/promise', () => ({ default: { createPool } }));
vi.mock('drizzle-orm/mysql2', () => ({ drizzle }));

/** 環境変数を差し替えてdb/index.tsを評価し直す。 */
async function importDb(env: Record<string, string | undefined>) {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
	Object.assign(mockEnv, env);
	vi.resetModules();
	createPool.mockClear();
	drizzle.mockClear();
	return import('./index');
}

afterEach(() => {
	vi.resetModules();
});

describe('DB接続の初期化', () => {
	it('DATABASE_URLが未設定なら起動時にthrowする', async () => {
		await expect(importDb({})).rejects.toThrow('DATABASE_URL is not set');
		expect(createPool).not.toHaveBeenCalled();
	});

	it('DATABASE_URLが空文字でも起動時にthrowする', async () => {
		await expect(importDb({ DATABASE_URL: '' })).rejects.toThrow('DATABASE_URL is not set');
	});

	it('DATABASE_URLからコネクションプールを作りDrizzleを初期化する', async () => {
		const { db } = await importDb({ DATABASE_URL: 'mysql://user:pass@localhost:3306/rootist' });

		expect(createPool).toHaveBeenCalledWith('mysql://user:pass@localhost:3306/rootist');
		expect(drizzle).toHaveBeenCalledWith(
			'mysql-pool',
			expect.objectContaining({ mode: 'default' })
		);
		expect(db).toBe('drizzle-db');
	});

	it('スキーマ定義をDrizzleへ渡す', async () => {
		await importDb({ DATABASE_URL: 'mysql://user:pass@localhost:3306/rootist' });

		const [, options] = drizzle.mock.calls[0] as unknown as [unknown, { schema: object }];
		expect(options.schema).toHaveProperty('plans');
		expect(options.schema).toHaveProperty('user');
	});
});
