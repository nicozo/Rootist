import { describe, expect, it, vi, beforeEach } from 'vite-plus/test';
import type { RouteResult } from '$lib/stores/route';

// issue #128: plans のリポジトリ層の単体テスト。postgres.js のクライアント（sql）をモックし、
// 「パラメータ化されたクエリが発行される」「data が JSON 文字列でなくオブジェクト由来で渡る」を検証する。

const { sql, sqlJson } = vi.hoisted(() => {
	const sqlJson = vi.fn((value: unknown) => ({ __json: value }));
	const sql = Object.assign(vi.fn(), { json: sqlJson });
	return { sql, sqlJson };
});

vi.mock('./index', () => ({ sql }));

const { insertPlan, findPlanByShareId } = await import('./plans');

const SHARE_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const data = {
	destinations: [],
	summary: '浅草日帰り',
	origin: undefined,
	transportMode: null,
	startTime: '10:00',
	planDate: '2026-10-10',
	endDestination: null
} as RouteResult;

/** タグ付きテンプレート呼び出しの SQL 文字列部分（プレースホルダ位置は ? で表す）。 */
function sqlText(call: unknown[]): string {
	return (call[0] as string[]).join('?').replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
	sql.mockReset();
	sqlJson.mockClear();
});

describe('insertPlan', () => {
	it('share_id と data を値としてパラメータ化して insert する（文字列連結しない）', async () => {
		sql.mockResolvedValue([]);

		await insertPlan(SHARE_ID, data);

		expect(sql).toHaveBeenCalledTimes(1);
		const call = sql.mock.calls[0];
		expect(sqlText(call)).toBe('insert into plans (share_id, data) values (?, ?)');
		expect(call[1]).toBe(SHARE_ID);
	});

	it('data は JSON 文字列ではなくオブジェクトを sql.json に渡す（jsonb の object として保存される）', async () => {
		sql.mockResolvedValue([]);

		await insertPlan(SHARE_ID, data);

		expect(sqlJson).toHaveBeenCalledTimes(1);
		const passed = sqlJson.mock.calls[0][0];
		expect(typeof passed).not.toBe('string');
		expect(passed).toBe(data);
		// テンプレートに渡る値は sql.json の戻り値（生の JSON 文字列ではない）
		expect(typeof sql.mock.calls[0][2]).not.toBe('string');
	});

	it('DBエラーは握りつぶさず伝播する', async () => {
		sql.mockRejectedValue(new Error('connection refused'));

		await expect(insertPlan(SHARE_ID, data)).rejects.toThrow('connection refused');
	});
});

describe('findPlanByShareId', () => {
	it('shareId をパラメータ化し limit 1 で取得する', async () => {
		sql.mockResolvedValue([{ data }]);

		await findPlanByShareId(SHARE_ID);

		const call = sql.mock.calls[0];
		expect(sqlText(call)).toBe('select data from plans where share_id = ? limit 1');
		expect(call[1]).toBe(SHARE_ID);
	});

	it('該当行があれば data（object）をそのまま返す', async () => {
		sql.mockResolvedValue([{ data }]);

		await expect(findPlanByShareId(SHARE_ID)).resolves.toBe(data);
	});

	it('該当行が無ければ null を返す', async () => {
		sql.mockResolvedValue([]);

		await expect(findPlanByShareId(SHARE_ID)).resolves.toBeNull();
	});

	it('過去に JSON 文字列スカラーとして保存された行も同じ RouteResult として返す', async () => {
		sql.mockResolvedValue([{ data: JSON.stringify({ destinations: [], summary: '文字列保存' }) }]);

		await expect(findPlanByShareId(SHARE_ID)).resolves.toEqual({
			destinations: [],
			summary: '文字列保存'
		});
	});

	it('DBエラーは握りつぶさず伝播する', async () => {
		sql.mockRejectedValue(new Error('connection refused'));

		await expect(findPlanByShareId(SHARE_ID)).rejects.toThrow('connection refused');
	});
});
