import { describe, expect, it } from 'vite-plus/test';
import {
	normalizeEmail,
	isValidEmailFormat,
	deriveNameFromEmail,
	checkPasswordLength,
	mapSignUpErrorCode,
	mapSignInErrorCode,
	EMAIL_FORMAT_MESSAGE,
	PASSWORD_LENGTH_MESSAGE,
	PASSWORD_TOO_LONG_MESSAGE,
	DUPLICATE_EMAIL_MESSAGE,
	LOGIN_FAILURE_MESSAGE,
	REGISTER_FAILURE_MESSAGE,
	RATE_LIMIT_MESSAGE
} from './auth-errors';

// issue #116: Supabase Auth向けのaction層エラーマッピング・メール正規化・パスワード長検査の単体テスト。
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
	it('既存メッセージの文言が変わっていない', () => {
		expect(EMAIL_FORMAT_MESSAGE).toBe('メールアドレスの形式が正しくありません');
		expect(PASSWORD_LENGTH_MESSAGE).toBe('パスワードは8文字以上で入力してください');
		expect(DUPLICATE_EMAIL_MESSAGE).toBe('このメールアドレスは既に登録されています');
		expect(LOGIN_FAILURE_MESSAGE).toBe('メールアドレスまたはパスワードが正しくありません');
		expect(REGISTER_FAILURE_MESSAGE).toBe('登録に失敗しました。もう一度お試しください。');
	});

	it('追加メッセージの文言', () => {
		expect(PASSWORD_TOO_LONG_MESSAGE).toBe(
			'パスワードが長すぎます（半角英数字で72文字以内にしてください）'
		);
		expect(RATE_LIMIT_MESSAGE).toBe(
			'試行回数が多すぎます。しばらく時間をおいてからもう一度お試しください。'
		);
	});
});

describe('checkPasswordLength', () => {
	it('7文字は短すぎるメッセージ', () => {
		expect(checkPasswordLength('a'.repeat(7))).toBe(PASSWORD_LENGTH_MESSAGE);
	});

	it('8文字は問題なし', () => {
		expect(checkPasswordLength('a'.repeat(8))).toBeNull();
	});

	it('72バイトちょうどは問題なし', () => {
		expect(checkPasswordLength('a'.repeat(72))).toBeNull();
	});

	it('73バイトは長すぎるメッセージ', () => {
		expect(checkPasswordLength('a'.repeat(73))).toBe(PASSWORD_TOO_LONG_MESSAGE);
	});

	it('マルチバイト文字は文字数ではなくUTF-8バイト数で上限を判定する', () => {
		// 「あ」は3バイト。24文字=72バイトは可、25文字=75バイトは不可
		expect(checkPasswordLength('あ'.repeat(24))).toBeNull();
		expect(checkPasswordLength('あ'.repeat(25))).toBe(PASSWORD_TOO_LONG_MESSAGE);
	});

	it('8文字未満のマルチバイトは短すぎるメッセージ（文字数で判定）', () => {
		expect(checkPasswordLength('あ'.repeat(7))).toBe(PASSWORD_LENGTH_MESSAGE);
		expect(checkPasswordLength('あ'.repeat(8))).toBeNull();
	});
});

describe('mapSignUpErrorCode', () => {
	it.each([
		['user_already_exists', DUPLICATE_EMAIL_MESSAGE],
		['email_exists', DUPLICATE_EMAIL_MESSAGE],
		['weak_password', PASSWORD_LENGTH_MESSAGE],
		['email_address_invalid', EMAIL_FORMAT_MESSAGE],
		['validation_failed', EMAIL_FORMAT_MESSAGE],
		['over_request_rate_limit', RATE_LIMIT_MESSAGE],
		['over_email_send_rate_limit', RATE_LIMIT_MESSAGE]
	])('%s を日本語メッセージに変換する', (code, message) => {
		expect(mapSignUpErrorCode(code)).toBe(message);
	});

	it('signup_disabledと未知のコードはnull（汎用メッセージにフォールバック）', () => {
		expect(mapSignUpErrorCode('signup_disabled')).toBeNull();
		expect(mapSignUpErrorCode('SOME_UNKNOWN_CODE')).toBeNull();
		expect(mapSignUpErrorCode(undefined)).toBeNull();
	});
});

describe('mapSignInErrorCode', () => {
	it.each(['over_request_rate_limit', 'over_email_send_rate_limit'])(
		'%s だけ回数制限メッセージにする',
		(code) => {
			expect(mapSignInErrorCode(code)).toBe(RATE_LIMIT_MESSAGE);
		}
	);

	it.each(['invalid_credentials', 'email_not_confirmed', 'user_not_found', 'whatever', undefined])(
		'%s は統一メッセージにする',
		(code) => {
			expect(mapSignInErrorCode(code)).toBe(LOGIN_FAILURE_MESSAGE);
		}
	);
});
