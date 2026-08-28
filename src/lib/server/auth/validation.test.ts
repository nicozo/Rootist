import { describe, expect, it } from 'vitest';
import {
	normalizeEmail,
	validateEmail,
	validatePassword,
	EMAIL_FORMAT_MESSAGE,
	PASSWORD_LENGTH_MESSAGE
} from './validation';

describe('normalizeEmail', () => {
	it('trimし小文字化する', () => {
		expect(normalizeEmail('  TEST@Example.com  ')).toBe('test@example.com');
	});
});

describe('validateEmail', () => {
	it('正しい形式は通す', () => {
		expect(validateEmail('test@example.com')).toEqual({ ok: true });
	});

	it('空文字は拒否する', () => {
		expect(validateEmail('')).toEqual({ ok: false, message: EMAIL_FORMAT_MESSAGE });
	});

	it('@がない場合は拒否する', () => {
		expect(validateEmail('not-an-email')).toEqual({ ok: false, message: EMAIL_FORMAT_MESSAGE });
	});

	it('ドメインにピリオドがない場合は拒否する', () => {
		expect(validateEmail('test@example')).toEqual({ ok: false, message: EMAIL_FORMAT_MESSAGE });
	});

	it('255文字を超える場合は拒否する', () => {
		const longLocal = 'a'.repeat(250);
		expect(validateEmail(`${longLocal}@example.com`)).toEqual({
			ok: false,
			message: EMAIL_FORMAT_MESSAGE
		});
	});
});

describe('validatePassword', () => {
	it('8文字以上は通す', () => {
		expect(validatePassword('password123')).toEqual({ ok: true });
	});

	it('7文字は拒否する', () => {
		expect(validatePassword('short12')).toEqual({ ok: false, message: PASSWORD_LENGTH_MESSAGE });
	});

	it('255文字を超える場合は拒否する', () => {
		expect(validatePassword('a'.repeat(256))).toEqual({
			ok: false,
			message: PASSWORD_LENGTH_MESSAGE
		});
	});

	it('境界値: 8文字ちょうどは通す', () => {
		expect(validatePassword('12345678')).toEqual({ ok: true });
	});

	it('境界値: 255文字ちょうどは通す', () => {
		expect(validatePassword('a'.repeat(255))).toEqual({ ok: true });
	});
});
