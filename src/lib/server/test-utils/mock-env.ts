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

type StandardSchema = {
	'~standard': {
		validate(value: string | undefined): {
			value?: unknown;
			issues?: readonly { message: string }[];
		};
	};
};

/**
 * src/env.ts の schema（defineEnvVars が標準スキーマに正規化したもの）で値を検証する。
 * 不正（必須の未設定など）なら、実機の起動時 / build 時の検証と同じ内容の Error を投げる。
 */
export function validateEnvVar(name: string, value: string | undefined) {
	const schema = (variables as unknown as Record<string, { schema: StandardSchema }>)[name].schema;
	const result = schema['~standard'].validate(value);
	if (result.issues) throw new Error(result.issues.map((i) => i.message).join('; '));
	return result.value;
}

/**
 * `$app/env/private` の代わりになるモジュールを作る。公開する変数名は src/env.ts の宣言から導出し、
 * 値は読むたびに mockEnv から取り、src/env.ts の schema を通す（空文字は未設定の扱い。必須変数の未設定は schema が
 * throw するので、読んだ時点＝それを使うモジュールの読み込み時に失敗する。実機では起動時 / build 時の検証に当たる）。
 */
export function createEnvModule() {
	const mod: Record<string, string | undefined> = {};
	for (const name of Object.keys(variables)) {
		Object.defineProperty(mod, name, {
			enumerable: true,
			get: () => validateEnvVar(name, mockEnv[name]) as string | undefined
		});
	}
	return mod;
}
