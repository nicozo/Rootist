import { describe, expect, it, vi } from 'vite-plus/test';

// issue #199: /login の load の単体テスト。form action は持たない（FR-011）。

vi.mock('#lib/server/supabase.js', () => ({ isGoogleAuthEnabled: false }));

const pageServer = await import('./+page.server');
const { load } = pageServer;

/** loadに渡す最小限のイベント。 */
function loadEvent(user: unknown, search = '') {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { locals: { user }, url: new URL(`http://localhost/login${search}`) } as any;
}

describe('/login load', () => {
	it('FR-008: ログイン済みなら/planへリダイレクトする', async () => {
		await expect(load(loadEvent({ email: 'a@example.com' }))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
	});

	it('FR-012: 未ログインならGoogleログインの可否を返す', async () => {
		await expect(load(loadEvent(null))).resolves.toEqual({
			googleAuthEnabled: false,
			googleError: null
		});
	});

	it('FR-007: errorクエリがあれば固定の日本語メッセージを返す', async () => {
		const data = (await load(loadEvent(null, '?error=google'))) as { googleError: string | null };

		expect(data.googleError).toBe('Googleログインを完了できませんでした。もう一度お試しください。');
	});

	it('FR-007: errorクエリの生の値は画面向けデータに載せない', async () => {
		const data = await load(loadEvent(null, '?error=<script>alert(1)</script>'));

		expect(JSON.stringify(data)).not.toContain('script');
	});

	it('FR-011: モジュールは form action（actions）を export しない', () => {
		expect('actions' in pageServer).toBe(false);
	});
});
