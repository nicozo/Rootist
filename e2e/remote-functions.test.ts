import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, waitForHydration } from './helpers';

// issue #159: /api/* から remote functions へ移行した 3 つの呼び出し口の、サーバー結合の E2E（build + preview）。
// 画面ごとの導線は plan / plan-result の各 E2E（remote function をモック）が担当し、ここは
// 「本物の remote function の入口」を直接確認する: クロスサイト検査、旧エンドポイントの消滅、
// 外部 API・DB に届かない入力での失敗応答の形。
//
// 環境（実 .env かダミーか）で結果が変わらないよう、外部 API（Places / Gemini）と DB に届く入力は送らない:
//   - 場所検索は 2 文字未満の query（本体が外部を呼ばずに空を返す）か、本体に届かない要求だけ
//   - ルート生成は目的地 1 件（業務ルールで 400）、プラン保存は空の destinations（境界で 400）

const ORIGIN = 'http://localhost:4173';
const REMOTE_PATH = '/_app/remote/';
const headers = { 'Content-Type': 'application/json' };

/** devalue（base64url）の引数文字列。引数は呼び出し側で devalue の表現（配列の JSON）を組む。 */
function devaluePayload(devalueJson: string) {
	return Buffer.from(devalueJson).toString('base64url');
}

/**
 * ビルド成果物（クライアント）から remote function の内部 URL を引く（UI を操作せずに直接呼ぶため）。
 */
function remoteUrl(name: string) {
	const stack = [join('.svelte-kit', 'output', 'client', '_app', 'immutable')];
	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) stack.push(path);
			else if (entry.name.endsWith('.js')) {
				const match = new RegExp(`([a-z0-9]+/${name})\\b`).exec(readFileSync(path, 'utf8'));
				if (match) return `${REMOTE_PATH}${match[1]}`;
			}
		}
	}
	throw new Error(
		`remote function ${name} がクライアントの成果物に見つかりません（pnpm build 済みか）`
	);
}

// 検索語が 1 文字（本体が外部 API を呼ばずに空配列を返す）の引数: { query: 'a' }
const SHORT_QUERY = devaluePayload(JSON.stringify([{ query: 1 }, 'a']));

test.describe('場所検索の remote function', () => {
	test('サーバーが失敗を返しても、候補は出ず画面は落ちない（load も再実行されない）', async ({
		page
	}) => {
		const dataRequests: string[] = [];
		const pageErrors: string[] = [];
		let searchCalls = 0;
		page.on('request', (req) => {
			if (req.url().includes('__data.json')) dataRequests.push(req.url());
		});
		page.on('pageerror', (e) => pageErrors.push(String(e)));
		await page.route(`**${REMOTE_PATH}*/searchPlaces`, (route) => {
			searchCalls += 1;
			return route.fulfill({
				status: 200,
				json: { type: 'error', error: { status: 500, message: 'Internal Error' } }
			});
		});

		await page.goto('/plan');
		await waitForHydration(page);
		const input = page.getByPlaceholder('例：東京タワー、浅草寺...');
		await expect(async () => {
			await input.fill('');
			await input.fill('東京タワー');
			await page.waitForTimeout(700);
			expect(searchCalls).toBeGreaterThan(0);
		}).toPass({ timeout: 20_000 });

		await expect(page.locator('[data-slot="command-list"]')).toHaveCount(0);
		await expect(input).toBeEditable();
		expect(dataRequests).toEqual([]);
		expect(pageErrors).toEqual([]);
	});

	test('クロスサイト（偽の Origin / Origin なし）の POST は 403 で拒否され、同一オリジンは本体に届く', async ({
		request
	}) => {
		const url = remoteUrl('searchPlaces');
		const data = { payload: SHORT_QUERY, refreshes: [] };

		const evil = await request.post(url, {
			headers: { ...headers, Origin: 'https://evil.example' },
			data
		});
		expect(evil.status()).toBe(403);
		expect(await evil.text()).toContain('Cross-site remote requests are forbidden');

		const noOrigin = await request.post(url, { headers, data });
		expect(noOrigin.status()).toBe(403);

		// 陽性対照: 同一オリジンなら本体に届き、1 文字の検索語は外部を呼ばずに空配列を返す
		const same = await request.post(url, { headers: { ...headers, Origin: ORIGIN }, data });
		expect(same.status()).toBe(200);
		expect((await same.json()).type).toBe('result');
	});

	test('command を偽 Origin の GET で呼んでも本体は実行されない', async ({ request }) => {
		const res = await request.get(remoteUrl('searchPlaces'), {
			headers: { Origin: 'https://evil.example' }
		});

		// GET は origin 検査を通るが、command は本文（POST）を要求するため本体は実行されない
		const json = await res.json();
		expect(json.type).toBe('error');
		expect(json.error.status).toBe(500);
		expect(json.error.message).toBe('Internal Error');
	});
});

test.describe('ルート生成・プラン保存（外部 API・DB に届かない入力のみ）', () => {
	const postHeaders = { ...headers, Origin: ORIGIN };

	test('目的地が 1 件のルート生成は、外部 API を呼ばずに 400 と既存の文言で失敗する', async ({
		request
	}) => {
		// arg = { locations: [{ name: 'a', displayAddress: 'b' }] } の devalue 表現
		const payload = devaluePayload(
			JSON.stringify([{ locations: 1 }, [2], { name: 3, displayAddress: 4 }, 'a', 'b'])
		);

		const res = await request.post(remoteUrl('generateRoute'), {
			headers: postHeaders,
			data: { payload, refreshes: [] }
		});

		// remote function の失敗は HTTP 200 + 本文の error.status で返る
		expect(res.status()).toBe(200);
		expect(await res.json()).toEqual({
			type: 'error',
			error: { status: 400, message: '2件以上の目的地が必要です' }
		});
	});

	test('空の destinations のプラン保存は境界で 400 になり、DB に届かない', async ({ request }) => {
		// arg = { destinations: [] } の devalue 表現
		const payload = devaluePayload(JSON.stringify([{ destinations: 1 }, []]));

		const res = await request.post(remoteUrl('savePlan'), {
			headers: postHeaders,
			data: { payload, refreshes: [] }
		});

		expect(res.status()).toBe(200);
		expect(await res.json()).toEqual({
			type: 'error',
			error: { status: 400, message: 'Bad Request' }
		});
	});
});

test.describe('旧エンドポイントの消滅', () => {
	for (const path of ['/api/places', '/api/route', '/api/plans']) {
		test(`POST ${path} は 2xx にならない`, async ({ request }) => {
			const res = await request.post(path, { headers: { ...headers, Origin: ORIGIN }, data: {} });

			expect(res.ok()).toBe(false);
		});
	}
});
