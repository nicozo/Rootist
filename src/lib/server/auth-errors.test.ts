import { describe, expect, it } from 'vitest';
import {
	normalizeEmail,
	isValidEmailFormat,
	deriveNameFromEmail,
	mapSignUpErrorCode,
	EMAIL_FORMAT_MESSAGE,
	PASSWORD_LENGTH_MESSAGE,
	DUPLICATE_EMAIL_MESSAGE
} from './auth-errors';

// issue #49: Better Auth移行後のaction層エラーマッピング・メール正規化の単体テスト。
// DBアクセス・Better Auth初期化を行わない純粋関数のみを対象とする（CIのダミーDATABASE_URLでも実行可能）。

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

describe('mapSignUpErrorCode', () => {
	it('INVALID_EMAILをメール形式エラーメッセージに変換する', () => {
		expect(mapSignUpErrorCode('INVALID_EMAIL')).toBe(EMAIL_FORMAT_MESSAGE);
	});

	it('PASSWORD_TOO_SHORTをパスワード長エラーメッセージに変換する', () => {
		expect(mapSignUpErrorCode('PASSWORD_TOO_SHORT')).toBe(PASSWORD_LENGTH_MESSAGE);
	});

	it('PASSWORD_TOO_LONGをパスワード長エラーメッセージに変換する', () => {
		expect(mapSignUpErrorCode('PASSWORD_TOO_LONG')).toBe(PASSWORD_LENGTH_MESSAGE);
	});

	it('USER_ALREADY_EXISTS_USE_ANOTHER_EMAILを重複メールエラーメッセージに変換する', () => {
		expect(mapSignUpErrorCode('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')).toBe(
			DUPLICATE_EMAIL_MESSAGE
		);
	});

	it('未知のコードはnullを返す', () => {
		expect(mapSignUpErrorCode('SOME_UNKNOWN_CODE')).toBeNull();
		expect(mapSignUpErrorCode(undefined)).toBeNull();
	});
});
