import { describe, expect, it } from 'vite-plus/test';
import type { User } from '@supabase/supabase-js';
import { resolveDisplayName, resolveImage, toAppUser } from './auth-user';

// issue #116: Supabaseユーザー → locals.user の変換（名前・画像の決定規則）の単体テスト。

function supabaseUser(overrides: Partial<User> = {}): User {
	return {
		id: '11111111-1111-1111-1111-111111111111',
		email: 'taro@example.com',
		user_metadata: {},
		app_metadata: {},
		aud: 'authenticated',
		created_at: '2026-10-01T00:00:00Z',
		...overrides
	} as User;
}

describe('resolveDisplayName', () => {
	it('name を最優先する', () => {
		expect(resolveDisplayName({ name: 'たろう', full_name: 'Taro Yamada' }, 'a@example.com')).toBe(
			'たろう'
		);
	});

	it('name が無ければ full_name', () => {
		expect(resolveDisplayName({ full_name: 'Taro Yamada' }, 'a@example.com')).toBe('Taro Yamada');
	});

	it('どちらも無ければメールのローカル部', () => {
		expect(resolveDisplayName({}, 'taro@example.com')).toBe('taro');
	});

	it('空文字・文字列以外は無視して次の候補へ', () => {
		expect(resolveDisplayName({ name: '', full_name: 123 }, 'taro@example.com')).toBe('taro');
		expect(resolveDisplayName({ name: null, full_name: '' }, 'taro@example.com')).toBe('taro');
		expect(resolveDisplayName({ name: { x: 1 }, full_name: 'F' }, 'taro@example.com')).toBe('F');
	});
});

describe('resolveImage', () => {
	it('avatar_url を最優先する', () => {
		expect(
			resolveImage({ avatar_url: 'https://e.com/a.png', picture: 'https://e.com/p.png' })
		).toBe('https://e.com/a.png');
	});

	it('avatar_url が無ければ picture', () => {
		expect(resolveImage({ picture: 'https://e.com/p.png' })).toBe('https://e.com/p.png');
	});

	it('どちらも無ければ null', () => {
		expect(resolveImage({})).toBeNull();
	});

	it('空文字・文字列以外は無視する', () => {
		expect(resolveImage({ avatar_url: '', picture: 5 })).toBeNull();
	});

	it('https:// 以外（http / javascript: / data: / 相対）は拒否して次の候補へ', () => {
		expect(resolveImage({ avatar_url: 'http://e.com/a.png' })).toBeNull();
		expect(
			resolveImage({ avatar_url: 'javascript:alert(1)', picture: 'https://e.com/p.png' })
		).toBe('https://e.com/p.png');
		expect(resolveImage({ avatar_url: 'data:image/png;base64,AAAA' })).toBeNull();
		expect(resolveImage({ avatar_url: '//e.com/a.png' })).toBeNull();
	});
});

describe('toAppUser', () => {
	it('idはSupabaseのUUID、emailはそのまま、name/imageは規則で決まる', () => {
		const user = supabaseUser({
			user_metadata: { name: 'たろう', avatar_url: 'https://e.com/a.png' }
		});
		expect(toAppUser(user)).toEqual({
			id: '11111111-1111-1111-1111-111111111111',
			email: 'taro@example.com',
			name: 'たろう',
			image: 'https://e.com/a.png'
		});
	});

	it('metadata が空でも name はローカル部、image は null', () => {
		expect(toAppUser(supabaseUser())).toMatchObject({ name: 'taro', image: null });
	});

	it('user_metadata が無くても落ちない', () => {
		expect(
			toAppUser(supabaseUser({ user_metadata: undefined as unknown as User['user_metadata'] }))
		).toMatchObject({ name: 'taro', image: null });
	});

	it('email が無い・空のユーザーは未ログイン扱い（null）', () => {
		expect(toAppUser(supabaseUser({ email: undefined }))).toBeNull();
		expect(toAppUser(supabaseUser({ email: '' }))).toBeNull();
	});

	it('null / undefined は null', () => {
		expect(toAppUser(null)).toBeNull();
		expect(toAppUser(undefined)).toBeNull();
	});
});
