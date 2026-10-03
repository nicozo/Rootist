import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #62: 共有プラン閲覧ページのload単体テスト。DBへは実接続せずselectをモックする。
// issue #115: shareIdのUUID形式チェック（不正形式はDBを呼ばず404）を追加。

const VALID_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';

const { limit, dbMock, eqMock } = vi.hoisted(() => {
	const limit = vi.fn();
	const eqMock = vi.fn(() => 'eq-condition');
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	return { limit, eqMock, dbMock: { select: vi.fn(() => ({ from })) } };
});

vi.mock('$lib/server/db', () => ({ db: dbMock }));
vi.mock('$lib/server/db/schema', () => ({ plans: { shareId: 'shareId' } }));
vi.mock('drizzle-orm', () => ({ eq: eqMock }));

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
		limit.mockResolvedValue([{ shareId: VALID_ID, data }]);

		await expect(load(loadEvent(VALID_ID))).resolves.toEqual({ result: data });
	});

	it('該当するプランが無ければ404を返す', async () => {
		limit.mockResolvedValue([]);

		await expect(load(loadEvent('11111111-2222-4333-8444-555555555555'))).rejects.toMatchObject({
			status: 404,
			body: { message: '共有されたプランが見つかりません' }
		});
	});

	it('1件だけ取得する', async () => {
		limit.mockResolvedValue([{ shareId: VALID_ID, data: {} }]);

		await load(loadEvent(VALID_ID));

		expect(limit).toHaveBeenCalledWith(1);
	});

	it.each([
		['UUIDでない文字列', 'not-a-uuid'],
		['NUL文字を含む', `${VALID_ID.slice(0, 8)}\u0000${VALID_ID.slice(9)}`],
		['37文字', `${VALID_ID}0`],
		['SQLインジェクション風', "' or 1=1--"],
		['空文字', '']
	])('形式が不正(%s)ならDBを呼ばずに404を返す', async (_label, shareId) => {
		await expect(load(loadEvent(shareId))).rejects.toMatchObject({
			status: 404,
			body: { message: '共有されたプランが見つかりません' }
		});
		expect(dbMock.select).not.toHaveBeenCalled();
	});

	it('大文字のUUIDは小文字に揃えて検索する', async () => {
		limit.mockResolvedValue([{ shareId: VALID_ID, data: {} }]);

		await load(loadEvent(VALID_ID.toUpperCase()));

		expect(eqMock).toHaveBeenCalledWith('shareId', VALID_ID);
	});

	it('形式が正しいIDでDBエラーが起きたら404にせずそのまま伝播する', async () => {
		limit.mockRejectedValue(new Error('connection refused'));

		await expect(load(loadEvent(VALID_ID))).rejects.toThrow('connection refused');
	});
});
