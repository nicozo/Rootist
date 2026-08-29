import { describe, expect, it } from 'vitest';
import { load } from './+layout.server';

// issue #62: 全ページ共通のユーザー情報受け渡しの単体テスト。

/** loadに渡す最小限のイベント。 */
function loadEvent(user: unknown) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { locals: { user } } as any;
}

describe('/+layout.server load', () => {
	it('未ログインならuserをnullで返す', async () => {
		await expect(load(loadEvent(null))).resolves.toEqual({ user: null });
	});

	it('ログイン中はアバター表示に必要な項目を返す', async () => {
		await expect(
			load(
				loadEvent({
					id: 'user-1',
					email: 'a@example.com',
					name: 'たろう',
					image: 'https://example.com/a.png'
				})
			)
		).resolves.toEqual({
			user: { email: 'a@example.com', name: 'たろう', image: 'https://example.com/a.png' }
		});
	});

	it('idはUIに不要なため渡さない', async () => {
		const data = (await load(
			loadEvent({ id: 'user-1', email: 'a@example.com', name: 'たろう', image: null })
		)) as { user: Record<string, unknown> };

		expect(data.user).not.toHaveProperty('id');
	});
});
