import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #189: /passkey（パスキー登録の案内）の load / dismiss の単体テスト（FR-015, FR-027）。

const { getUser, updateUser } = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));

const { load, actions } = await import('./+page.server');

const USER = { id: 'u1', email: 'a@example.com', name: 'a', image: null };

function event(user: unknown) {
	return {
		locals: { user, supabase: { auth: { getUser, updateUser } } }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

function withDismissals(dismissals?: unknown) {
	getUser.mockResolvedValue({
		data: {
			user: {
				id: 'u1',
				user_metadata: dismissals === undefined ? {} : { passkey_prompt_dismissals: dismissals }
			}
		},
		error: null
	});
}

beforeEach(() => {
	withDismissals();
	updateUser.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('/passkey load', () => {
	it('未ログインなら/loginへリダイレクトする', async () => {
		await expect(load(event(null))).rejects.toMatchObject({ status: 303, location: '/login' });
	});

	it('ログイン済みなら表示できる（リダイレクトしない）', async () => {
		const result = await load(event(USER));

		expect(result ?? {}).not.toHaveProperty('location');
	});
});

describe('/passkey dismiss', () => {
	it('未ログインなら/loginへリダイレクトし、何も書かない', async () => {
		await expect(actions.dismiss(event(null))).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('FR-015, FR-027: 見送り回数が無ければ 1 にして/planへ303', async () => {
		await expect(actions.dismiss(event(USER))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});

		expect(updateUser).toHaveBeenCalledWith({ data: { passkey_prompt_dismissals: 1 } });
	});

	it('FR-027: 見送り回数を 1 増やす', async () => {
		withDismissals(2);

		await expect(actions.dismiss(event(USER))).rejects.toMatchObject({ location: '/plan' });

		expect(updateUser).toHaveBeenCalledWith({ data: { passkey_prompt_dismissals: 3 } });
	});

	it('見送り回数が数値でなければ 0 と見なして 1 にする', async () => {
		withDismissals('many');

		await expect(actions.dismiss(event(USER))).rejects.toMatchObject({ location: '/plan' });

		expect(updateUser).toHaveBeenCalledWith({ data: { passkey_prompt_dismissals: 1 } });
	});

	it('回数の保存に失敗しても/planへ進む（利用者を止めない）', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		updateUser.mockResolvedValue({ data: {}, error: { name: 'AuthApiError', status: 500 } });

		await expect(actions.dismiss(event(USER))).rejects.toMatchObject({
			status: 303,
			location: '/plan'
		});
	});

	it('ユーザーの取得に失敗したら回数を書かずに/planへ進む', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError' } });

		await expect(actions.dismiss(event(USER))).rejects.toMatchObject({ location: '/plan' });

		expect(updateUser).not.toHaveBeenCalled();
	});

	it('例外が出ても500にせず/planへ進む', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		updateUser.mockRejectedValue(new Error('network'));

		await expect(actions.dismiss(event(USER))).rejects.toMatchObject({ location: '/plan' });
	});
});
