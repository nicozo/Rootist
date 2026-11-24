import { describe, expect, it } from 'vite-plus/test';
import { describeAuthError, isUnexpectedAuthError } from './auth-errors';

// issue #116: Supabase Auth のエラーのログ用の要約と想定外の判定の単体テスト（issue #199 でメールのコード用を削除）。
// DBアクセス・Supabase初期化を行わない純粋関数のみを対象とする。

describe('isUnexpectedAuthError / describeAuthError', () => {
	it.each([
		[{ name: 'AuthRetryableFetchError', status: 0 }],
		[{ name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }],
		[{ name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429 }],
		[{ name: 'AuthApiError', status: 503 }]
	])('障害・回数制限・5xx は想定外（ログ対象）', (error) => {
		expect(isUnexpectedAuthError(error)).toBe(true);
	});

	it.each([
		[{ name: 'AuthSessionMissingError' }],
		[{ name: 'AuthApiError', code: 'session_not_found', status: 403 }],
		[{ name: 'AuthApiError', code: 'invalid_credentials', status: 400 }],
		[{ name: 'AuthApiError', code: 'user_already_exists', status: 422 }]
	])('通常の失敗・セッション無しは想定内（ログ対象外）', (error) => {
		expect(isUnexpectedAuthError(error)).toBe(false);
	});

	it('describeAuthError は name/code/status だけを返す', () => {
		expect(
			describeAuthError({ name: 'X', code: 'c', status: 1, message: 'secret' } as never)
		).toEqual({ name: 'X', code: 'c', status: 1 });
	});
});
