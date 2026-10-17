import { error } from '@sveltejs/kit';

// remote function（`*.remote.ts`）をテストで「スキーマ検証 → 本体」の本物の経路で呼ぶための補助（issue #159）。
//
// 使い方（各テストファイルの先頭。vi.mock は巻き上げられるので動的 import で組み立てる）:
//   vi.mock('$app/server', async () =>
//     (await import('#lib/server/test-utils/remote-call.js')).createAppServerModule());
//   const { savePlan } = await import('#lib/remote/plans.remote.js');   // 本物の remote モジュール
//   import { callRemote } from '#lib/server/test-utils/remote-call.js';
//   await callRemote(savePlan, { destinations: [...] });
//
// `$app/server` の `command(schema, fn)` を、渡された schema と fn を保持するだけの関数に差し替える。
// callRemote は kit の validator（app/server/remote/shared.js の create_validator）と同じ手順を再現する:
//   `await schema['~standard'].validate(arg)` → issues があれば 400 'Bad Request' → 無ければ fn(value)。
// 検証に `v.parse` は使わない。スキーマを指定し忘れた・別のスキーマを渡した・'unchecked' にした場合も、
// 「本物の .remote.ts が実際に登録したスキーマ」を通るのでテストで検出できる。

const REMOTE = Symbol.for('rootist.test.remote');

type StandardSchema = {
	'~standard': {
		validate(value: unknown):
			| { value?: unknown; issues?: readonly unknown[] }
			| Promise<{
					value?: unknown;
					issues?: readonly unknown[];
			  }>;
	};
};

interface RemoteRegistration {
	schema: StandardSchema | 'unchecked' | undefined;
	fn: (arg: unknown) => unknown;
}

type RemoteStub = ((...args: unknown[]) => never) & { [REMOTE]: RemoteRegistration };

/** `vi.mock('$app/server', ...)` の戻り値に使う。command だけを提供する。 */
export function createAppServerModule() {
	function command(...args: unknown[]): RemoteStub {
		const [schemaOrFn, maybeFn] = args;
		const registration: RemoteRegistration =
			typeof schemaOrFn === 'function' && maybeFn === undefined
				? { schema: undefined, fn: schemaOrFn as RemoteRegistration['fn'] }
				: {
						schema: schemaOrFn as RemoteRegistration['schema'],
						fn: maybeFn as RemoteRegistration['fn']
					};
		const stub = (() => {
			throw new Error('remote function stub: call it through callRemote()');
		}) as unknown as RemoteStub;
		stub[REMOTE] = registration;
		// kit の init_remote_functions が「全 export が remote function であること」を検査するための印
		Object.defineProperty(stub, '__', { value: { type: 'command', id: '', name: '' } });
		return stub;
	}
	return { command };
}

/**
 * 本物の remote module が、検証を省略せずスキーマを登録していることを確かめる
 * （スキーマの指定忘れ・検証の省略指定は、経路テストの前提を崩すため検出する）。
 */
export function assertSchemaRegistered(remote: unknown) {
	const { schema } = (remote as RemoteStub)[REMOTE];
	if (typeof schema !== 'object' || schema === null || !('~standard' in schema)) {
		throw new Error('remote function has no registered schema (missing or validation skipped)');
	}
}

/**
 * remote function を、境界のスキーマ検証 → 本体の経路で呼ぶ。
 * 検証失敗・本体の `error()` は kit と同じ HttpError（status / body.message）を投げる。
 */
export async function callRemote<T = unknown>(remote: unknown, arg?: unknown): Promise<T> {
	const registration = (remote as RemoteStub)[REMOTE];
	if (!registration) throw new Error('not a remote function (was $app/server mocked?)');

	let value = arg;
	const { schema } = registration;
	if (schema && schema !== 'unchecked') {
		const result = await schema['~standard'].validate(arg);
		if (result.issues) error(400, 'Bad Request');
		value = result.value;
	}
	return (await registration.fn(value)) as T;
}
