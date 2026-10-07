import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

// issue #149: 選んだ場所の座標を取得するプロキシの単体テスト。
// 実際のGoogle Places API（課金対象）は絶対に叩かず、fetchをモックする。

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

const { POST } = await import('./+server');

function eventWith(body: unknown) {
	return {
		request: new Request('http://localhost/api/places/details', {
			method: 'POST',
			body: JSON.stringify(body)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

function stubDetails(body: unknown, status = 200) {
	const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

beforeEach(() => {
	mockEnv.GOOGLE_MAPS_API_KEY = 'test-api-key';
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('POST /api/places/details', () => {
	it('locationだけをFieldMaskで要求し、セッショントークンを付けて呼ぶ', async () => {
		const fetchSpy = stubDetails({ location: { latitude: 35.7, longitude: 139.8 } });

		const res = await POST(eventWith({ placeId: 'ChIJ_abc-123', sessionToken: 'token-1' }));

		expect(await res.json()).toEqual({ location: { lat: 35.7, lng: 139.8 } });
		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toBe(
			'https://places.googleapis.com/v1/places/ChIJ_abc-123?sessionToken=token-1'
		);
		expect(init.headers).toEqual({
			'X-Goog-Api-Key': 'test-api-key',
			'X-Goog-FieldMask': 'location'
		});
	});

	it('形式外のセッショントークンは付けない', async () => {
		const fetchSpy = stubDetails({ location: { latitude: 35.7, longitude: 139.8 } });

		await POST(eventWith({ placeId: 'ChIJabc', sessionToken: 'a b&c' }));

		expect(String(fetchSpy.mock.calls[0][0])).toBe(
			'https://places.googleapis.com/v1/places/ChIJabc'
		);
	});

	it.each([undefined, '', '../places', 'abc/def', 'a?b', 123])(
		'不正なplaceId %s は外部APIを呼ばず400を返す',
		async (placeId) => {
			const fetchSpy = stubDetails({});

			await expect(POST(eventWith({ placeId }))).rejects.toMatchObject({ status: 400 });
			expect(fetchSpy).not.toHaveBeenCalled();
		}
	);

	it('APIキーが未設定なら500を返す', async () => {
		mockEnv.GOOGLE_MAPS_API_KEY = undefined;
		stubDetails({});

		await expect(POST(eventWith({ placeId: 'ChIJabc' }))).rejects.toMatchObject({ status: 500 });
	});

	it('Places APIがエラーなら502を返し、生のエラー本文は返さない', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		stubDetails({ error: 'secret detail' }, 403);

		await expect(POST(eventWith({ placeId: 'ChIJabc' }))).rejects.toMatchObject({
			status: 502,
			body: { message: 'Places API request failed' }
		});
	});

	it('座標が含まれないレスポンスは502を返す', async () => {
		stubDetails({});

		await expect(POST(eventWith({ placeId: 'ChIJabc' }))).rejects.toMatchObject({ status: 502 });
	});
});
