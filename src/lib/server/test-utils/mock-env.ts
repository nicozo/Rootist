import { variables } from '../../../env.js';

// 環境変数モジュール（$app/env/private）をテストで差し替える唯一の方式（issue #146 D3）。
// 使い方（各テストファイルの先頭。vi.mock は巻き上げられるので動的 import で組み立てる）:
//   vi.mock('$app/env/private', async () =>
//     (await import('#lib/server/test-utils/mock-env.js')).createEnvModule());
//   import { mockEnv } from '#lib/server/test-utils/mock-env.js';
//   mockEnv.GEMINI_API_KEY = 'x';  // 値を差し替える（delete で未定義）
//
// vi.resetModules() の後もテスト側の mockEnv とモジュール側が同じオブジェクトを指すよう、
// 状態は globalThis に置く（resetModules でこのファイルが再評価されても分岐しない）。
const STATE_KEY = Symbol.for('rootist.test.mockEnv');
type MockEnv = Record<string, string | undefined>;
const globalState = globalThis as unknown as Record<symbol, MockEnv | undefined>;

/** テストが書き換える環境変数の値（未設定は undefined / 削除） */
export const mockEnv: MockEnv = (globalState[STATE_KEY] ??= {});

/** 全変数を未設定に戻す */
export function clearMockEnv() {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
}

/**
 * `$app/env/private` の代わりになるモジュールを作る。公開する変数名は src/env.ts の宣言から導出し、
 * 値は読むたびに mockEnv から取る。空文字は未設定（undefined）として扱う（env.ts の schema と同じ規則）。
 */
export function createEnvModule() {
	const mod: Record<string, string | undefined> = {};
	for (const name of Object.keys(variables)) {
		Object.defineProperty(mod, name, {
			enumerable: true,
			get: () => mockEnv[name] || undefined
		});
	}
	return mod;
}
