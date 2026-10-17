import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';

// issue #159: /api/* から remote functions へ移行した 3 つの呼び出し口の E2E（build + preview で実行する）。
//
// CI と同じ環境（Places / Gemini キーなし、DB はダミー）で実行する前提。キーがあると場所検索は
// 実際の Places API（課金対象）を呼び、期待値の 'GOOGLE_MAPS_API_KEY is not set' とも食い違う。
// 手元で .env に実キーがある場合は、キーを空にして起動してから実行する（.dev-loop の契約 §3-0）。
// プラン保存はここでは呼ばない（共有 DB への書き込みになるため）。

const ORIGIN = 'http://localhost:4173';
const SEARCH_INPUT = '例：東京タワー、浅草寺...';
const REMOTE_URL = '/_app/remote/';

type CapturedCall = { url: string; body: string; status?: number; json?: unknown };

/** devalue（base64url）の引数文字列を作る。引数は呼び出し側で devalue の表現（配列）を組む。 */
function devaluePayload(devalueJson: string) {
	return Buffer.from(devalueJson).toString('base64url');
}

/**
 * ビルド成果物（クライアント）から remote function の内部 URL を引く。
 * UI を操作せずに他の 2 関数（ルート生成・プラン保存）を直接呼ぶために使う。
 */
function remoteUrl(name: string) {
	const dir = join('.svelte-kit', 'output', 'client', '_app', 'immutable');
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) stack.push(path);
			else if (entry.name.endsWith('.js')) {
				const match = new RegExp(`([a-z0-9]+/${name})\\b`).exec(readFileSync(path, 'utf8'));
				if (match) return `${REMOTE_URL}${match[1]}`;
			}
		}
	}
	throw new Error(
		`remote function ${name} がクライアントの成果物に見つかりません（pnpm build 済みか）`
	);
}

/** 場所検索を 1 回発生させ、remote function への POST（URL と本文）を捕まえる。 */
async function captureSearchCall(page: Page): Promise<CapturedCall> {
	let captured: CapturedCall | undefined;
	page.on('request', (req: Request) => {
		if (req.method() === 'POST' && req.url().includes(REMOTE_URL)) {
			captured ??= { url: req.url(), body: req.postData() ?? '' };
		}
	});
	page.on('response', async (res) => {
		if (res.request().method() === 'POST' && res.url().includes(REMOTE_URL) && captured) {
			captured.status ??= res.status();
			captured.json ??= await res.json().catch(() => undefined);
		}
	});

	await page.goto('/plan');
	await page.waitForLoadState('networkidle');

	// hydration 前の入力は oninput が走らないため、リクエストを観測できるまで入力し直す
	await expect(async () => {
		const input = page.getByPlaceholder(SEARCH_INPUT);
		await input.fill('');
		await input.fill('東京タワー');
		await page.waitForTimeout(700);
		expect(captured?.json).toBeDefined();
	}).toPass({ timeout: 20_000 });

	return captured!;
}

test.describe('場所検索の remote function', () => {
	test('E1: 検索すると remote URL へ POST し、キー未設定の失敗でも画面は落ちない', async ({
		page
	}) => {
		const dataRequests: string[] = [];
		const pageErrors: string[] = [];
		page.on('request', (req) => {
			if (req.url().includes('__data.json')) dataRequests.push(req.url());
		});
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		const call = await captureSearchCall(page);

		expect(call.url).toMatch(/\/_app\/remote\/[^/]+\/searchPlaces$/);
		// remote function の失敗は HTTP 200 + 本文の error.status で返る（kit 3.0.1）
		expect(call.status).toBe(200);
		const json = call.json as { type: string; error: { status: number; message: string } };
		expect(json.type).toBe('error');
		expect(json.error.status).toBe(500);
		expect(json.error.message).toBe('GOOGLE_MAPS_API_KEY is not set');

		// 候補は出ず、入力欄は操作可能なまま。load の再実行（__data.json）や未処理例外も起きない
		await expect(page.locator('[data-slot="command-list"]')).toHaveCount(0);
		await expect(page.getByPlaceholder(SEARCH_INPUT)).toBeEditable();
		expect(dataRequests).toEqual([]);
		expect(pageErrors).toEqual([]);
	});

	test('E4: クロスサイト（偽の Origin / Origin なし）の POST は 403 で拒否され、同一オリジンは本体まで届く', async ({
		page,
		request
	}) => {
		const call = await captureSearchCall(page);
		const headers = { 'Content-Type': 'application/json' };

		const evil = await request.post(call.url, {
			headers: { ...headers, Origin: 'https://evil.example' },
			data: call.body
		});
		expect(evil.status()).toBe(403);
		expect(await evil.text()).toContain('Cross-site remote requests are forbidden');

		// Origin ヘッダーなし（request fixture は付けない）
		const noOrigin = await request.post(call.url, { headers, data: call.body });
		expect(noOrigin.status()).toBe(403);

		// 陽性対照: 同一オリジンなら 200 で本体に届き、キー未設定のエラーが本文に入る
		const same = await request.post(call.url, {
			headers: { ...headers, Origin: ORIGIN },
			data: call.body
		});
		expect(same.status()).toBe(200);
		expect((await same.json()).error.message).toBe('GOOGLE_MAPS_API_KEY is not set');
	});

	test('E5: command を偽 Origin の GET で呼んでも本体は実行されない', async ({ page, request }) => {
		const call = await captureSearchCall(page);

		const res = await request.get(call.url, { headers: { Origin: 'https://evil.example' } });

		// GET は origin 検査を通るが、command は本文（POST）を要求するため本体は実行されない
		const json = await res.json();
		expect(json.type).toBe('error');
		expect(json.error.message).not.toBe('GOOGLE_MAPS_API_KEY is not set');
		expect(json.error.status).toBe(500);
	});
});

test.describe('ルート生成・プラン保存（外部 API・DB に届かない入力のみ）', () => {
	const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };

	test('目的地が 1 件のルート生成は、外部 API を呼ばずに 400 と既存の文言で失敗する', async ({
		request
	}) => {
		// arg = { locations: [{ name: 'a', displayAddress: 'b' }] } の devalue 表現
		const payload = devaluePayload(
			JSON.stringify([{ locations: 1 }, [2], { name: 3, displayAddress: 4 }, 'a', 'b'])
		);

		const res = await request.post(remoteUrl('generateRoute'), {
			headers,
			data: { payload, refreshes: [] }
		});

		expect(res.status()).toBe(200);
		const json = await res.json();
		expect(json.type).toBe('error');
		expect(json.error.status).toBe(400);
		expect(json.error.message).toBe('2件以上の目的地が必要です');
	});

	test('空の destinations のプラン保存は境界で 400 になり、DB に届かない', async ({ request }) => {
		// arg = { destinations: [] } の devalue 表現
		const payload = devaluePayload(JSON.stringify([{ destinations: 1 }, []]));

		const res = await request.post(remoteUrl('savePlan'), {
			headers,
			data: { payload, refreshes: [] }
		});

		expect(res.status()).toBe(200);
		const json = await res.json();
		expect(json.type).toBe('error');
		expect(json.error.status).toBe(400);
		expect(json.error.message).toBe('Bad Request');
	});
});

test.describe('旧エンドポイントの消滅', () => {
	for (const path of ['/api/places', '/api/route', '/api/plans']) {
		test(`E2: POST ${path} は 2xx にならない`, async ({ request }) => {
			const res = await request.post(path, {
				headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
				data: {}
			});

			expect(res.ok()).toBe(false);
		});
	}
});
