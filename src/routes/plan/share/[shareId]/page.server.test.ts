import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #62: 共有プラン閲覧ページのload単体テスト。DBへは実接続せず取得関数(findPlanByShareId)をモックする。
// issue #128: drizzleをやめ、plansの取得は $lib/server/db/plans に集約した。
// issue #115: shareIdのUUID形式チェック（不正形式はDBを呼ばず404）を追加。

const VALID_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';

const { findPlanByShareId } = vi.hoisted(() => ({ findPlanByShareId: vi.fn() }));

vi.mock('$lib/server/db/plans', () => ({ findPlanByShareId }));

const { load } = await import('./+page.server');

/** loadに渡す最小限のイベント。 */
function loadEvent(shareId: string) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { params: { shareId } } as any;
}

beforeEach(() => {
	findPlanByShareId.mockResolvedValue(null);
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('/plan/share/[shareId] load', () => {
	it('該当するプランがあればその内容を返す', async () => {
		const data = { destinations: [], summary: '浅草日帰り' };
		findPlanByShareId.mockResolvedValue(data);

		await expect(load(loadEvent(VALID_ID))).resolves.toEqual({ result: data });
	});

	it('該当するプランが無ければ404を返す', async () => {
		findPlanByShareId.mockResolvedValue(null);

		await expect(load(loadEvent('11111111-2222-4333-8444-555555555555'))).rejects.toMatchObject({
			status: 404,
			body: { message: '共有されたプランが見つかりません' }
		});
	});

	it('1件だけ取得する', async () => {
		findPlanByShareId.mockResolvedValue({});

		await load(loadEvent(VALID_ID));

		expect(findPlanByShareId).toHaveBeenCalledTimes(1);
		expect(findPlanByShareId).toHaveBeenCalledWith(VALID_ID);
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
		expect(findPlanByShareId).not.toHaveBeenCalled();
	});

	it('大文字のUUIDは小文字に揃えて検索する', async () => {
		findPlanByShareId.mockResolvedValue({});

		await load(loadEvent(VALID_ID.toUpperCase()));

		expect(findPlanByShareId).toHaveBeenCalledWith(VALID_ID);
	});

	it('形式が正しいIDでDBエラーが起きたら404にせずそのまま伝播する', async () => {
		findPlanByShareId.mockRejectedValue(new Error('connection refused'));

		await expect(load(loadEvent(VALID_ID))).rejects.toThrow('connection refused');
	});
});
