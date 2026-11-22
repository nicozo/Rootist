import { describe, expect, it } from 'vite-plus/test';
import {
	normalizeEmail,
	isValidEmailFormat,
	deriveNameFromEmail,
	mapSendCodeErrorCode,
	mapVerifyCodeErrorCode,
	describeAuthError,
	isUnexpectedAuthError,
	EMAIL_FORMAT_MESSAGE,
	CODE_INVALID_MESSAGE,
	RESEND_WAIT_MESSAGE,
	SEND_FAILURE_MESSAGE,
	RATE_LIMIT_MESSAGE
} from './auth-errors';

// issue #116: Supabase Auth向けのaction層エラーマッピング・メール正規化・OTP（メールのコード）のエラー対応の単体テスト（issue #189 でパスワード用を削除）。
// DBアクセス・Supabase初期化を行わない純粋関数のみを対象とする（CIのダミーDATABASE_URLでも実行可能）。

describe('normalizeEmail', () => {
	it('trimしてから小文字化する', () => {
		expect(normalizeEmail('  Test@Example.com  ')).toBe('test@example.com');
	});
});

describe('isValidEmailFormat', () => {
	it('正しい形式のメールアドレスを受理する', () => {
		expect(isValidEmailFormat('test@example.com')).toBe(true);
	});

	it('@を含まない文字列を拒否する', () => {
		expect(isValidEmailFormat('not-an-email')).toBe(false);
	});

	it('空文字を拒否する', () => {
		expect(isValidEmailFormat('')).toBe(false);
	});

	it('255文字を超えるメールアドレスを拒否する', () => {
		const local = 'a'.repeat(250);
		expect(isValidEmailFormat(`${local}@example.com`)).toBe(false);
	});
});

describe('deriveNameFromEmail', () => {
	it('メールのローカル部を名前として返す', () => {
		expect(deriveNameFromEmail('taro@example.com')).toBe('taro');
	});

	it('ローカル部が空の場合はメール全体を返す', () => {
		expect(deriveNameFromEmail('@example.com')).toBe('@example.com');
	});
});

describe('メッセージ定数', () => {
	it('文言', () => {
		expect(EMAIL_FORMAT_MESSAGE).toBe('メールアドレスの形式が正しくありません');
		expect(RATE_LIMIT_MESSAGE).toBe(
			'試行回数が多すぎます。しばらく時間をおいてからもう一度お試しください。'
		);
		expect(CODE_INVALID_MESSAGE).toBe(
			'コードが正しくないか、期限が切れています。入力し直すか、コードを再送してください。'
		);
		expect(RESEND_WAIT_MESSAGE).toBe(
			'コードを送ったばかりです。60秒ほど待ってから再送してください。'
		);
		expect(SEND_FAILURE_MESSAGE).toBe('コードを送れませんでした。もう一度お試しください。');
	});
});

describe('mapSendCodeErrorCode（FR-009, FR-011, FR-023, FR-025）', () => {
	it.each([
		['email_address_invalid', EMAIL_FORMAT_MESSAGE],
		['validation_failed', EMAIL_FORMAT_MESSAGE],
		['over_email_send_rate_limit', RESEND_WAIT_MESSAGE],
		['over_request_rate_limit', RATE_LIMIT_MESSAGE],
		['unexpected_failure', SEND_FAILURE_MESSAGE],
		['SOME_UNKNOWN_CODE', SEND_FAILURE_MESSAGE],
		[undefined, SEND_FAILURE_MESSAGE]
	])('%s を日本語メッセージに変換する', (code, message) => {
		expect(mapSendCodeErrorCode(code)).toBe(message);
	});
});

describe('mapVerifyCodeErrorCode（FR-008, FR-022, FR-023）', () => {
	it.each([
		['otp_expired', CODE_INVALID_MESSAGE],
		['validation_failed', CODE_INVALID_MESSAGE],
		['over_request_rate_limit', RATE_LIMIT_MESSAGE],
		['over_email_send_rate_limit', RATE_LIMIT_MESSAGE],
		['SOME_UNKNOWN_CODE', CODE_INVALID_MESSAGE],
		[undefined, CODE_INVALID_MESSAGE]
	])('%s を日本語メッセージに変換する', (code, message) => {
		expect(mapVerifyCodeErrorCode(code)).toBe(message);
	});
});

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
