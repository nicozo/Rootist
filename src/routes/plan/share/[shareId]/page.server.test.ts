import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// issue #62: 共有プラン閲覧ページのload単体テスト。DBへは実接続せずselectをモックする。

const { limit, dbMock } = vi.hoisted(() => {
	const limit = vi.fn();
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	return { limit, dbMock: { select: vi.fn(() => ({ from })) } };
});

vi.mock('$lib/server/db', () => ({ db: dbMock }));
vi.mock('$lib/server/db/schema', () => ({ plans: { shareId: 'shareId' } }));

const { load } = await import('./+page.server');

/** loadに渡す最小限のイベント。 */
function loadEvent(shareId: string) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { params: { shareId } } as any;
}

beforeEach(() => {
	limit.mockResolvedValue([]);
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('/plan/share/[shareId] load', () => {
	it('該当するプランがあればその内容を返す', async () => {
		const data = { destinations: [], summary: '浅草日帰り' };
		limit.mockResolvedValue([{ shareId: 'abc', data }]);

		await expect(load(loadEvent('abc'))).resolves.toEqual({ result: data });
	});

	it('該当するプランが無ければ404を返す', async () => {
		limit.mockResolvedValue([]);

		await expect(load(loadEvent('missing'))).rejects.toMatchObject({
			status: 404,
			body: { message: '共有されたプランが見つかりません' }
		});
	});

	it('1件だけ取得する', async () => {
		limit.mockResolvedValue([{ shareId: 'abc', data: {} }]);

		await load(loadEvent('abc'));

		expect(limit).toHaveBeenCalledWith(1);
	});
});
