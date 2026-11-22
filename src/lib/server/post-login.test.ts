import { describe, expect, it, vi } from 'vite-plus/test';
import { resolvePostLoginPath } from './post-login';

// issue #189: ログイン直後の行き先の判定（FR-013, FR-027）。Supabase クライアントはモックする。

/** 行き先の判定が使う分だけの Supabase クライアント。 */
function supabaseWith(options: {
	passkeys?: unknown[] | null;
	listError?: unknown;
	dismissals?: unknown;
	userError?: unknown;
}) {
	const metadata: Record<string, unknown> = {};
	if (options.dismissals !== undefined) metadata.passkey_prompt_dismissals = options.dismissals;
	return {
		auth: {
			passkey: {
				list: vi.fn().mockResolvedValue({
					data: options.listError ? null : (options.passkeys ?? []),
					error: options.listError ?? null
				})
			},
			getUser: vi
				.fn()
				.mockResolvedValue(
					options.userError
						? { data: { user: null }, error: options.userError }
						: { data: { user: { id: 'u1', user_metadata: metadata } }, error: null }
				)
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe('resolvePostLoginPath', () => {
	it('FR-013: パスキーが 0 件で見送りが無ければ /passkey', async () => {
		await expect(resolvePostLoginPath(supabaseWith({ passkeys: [] }))).resolves.toBe('/passkey');
	});

	it('FR-013: パスキーが 1 件以上あれば /plan', async () => {
		const passkeys = [{ id: 'p1', created_at: '2026-11-22T00:00:00Z' }];
		await expect(resolvePostLoginPath(supabaseWith({ passkeys }))).resolves.toBe('/plan');
	});

	it.each([1, 2])('FR-027: 見送りが %i 回なら /passkey', async (dismissals) => {
		await expect(resolvePostLoginPath(supabaseWith({ passkeys: [], dismissals }))).resolves.toBe(
			'/passkey'
		);
	});

	it.each([3, 4])('FR-027: 見送りが %i 回なら /plan', async (dismissals) => {
		await expect(resolvePostLoginPath(supabaseWith({ passkeys: [], dismissals }))).resolves.toBe(
			'/plan'
		);
	});

	it('FR-027: 見送り回数が数値でなければ 0 と見なして /passkey', async () => {
		await expect(
			resolvePostLoginPath(supabaseWith({ passkeys: [], dismissals: 'many' }))
		).resolves.toBe('/passkey');
	});

	it('パスキーの一覧の取得に失敗したら /plan', async () => {
		await expect(
			resolvePostLoginPath(supabaseWith({ listError: { name: 'AuthApiError', status: 500 } }))
		).resolves.toBe('/plan');
	});

	it('ユーザーの取得に失敗したら /plan', async () => {
		await expect(
			resolvePostLoginPath(supabaseWith({ passkeys: [], userError: { name: 'AuthApiError' } }))
		).resolves.toBe('/plan');
	});

	it('例外が出ても /plan（ログインを妨げない）', async () => {
		const supabase = supabaseWith({ passkeys: [] });
		supabase.auth.passkey.list.mockRejectedValue(new Error('network'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(resolvePostLoginPath(supabase)).resolves.toBe('/plan');
	});
});
