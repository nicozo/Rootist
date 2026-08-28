import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// issue #62: Places APIプロキシの単体テスト。
// 実際のGoogle Places API（課金対象）は絶対に叩かず、fetchをモックする。

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

const { POST } = await import('./+server');

/** RequestHandlerに渡す最小限のイベント。テスト対象はrequestしか参照しない。 */
function eventWith(body: unknown) {
	return {
		request: new Request('http://localhost/api/places', {
			method: 'POST',
			body: JSON.stringify(body)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

/** placePrediction 1件分のGoogle Places APIレスポンス断片を組み立てる。 */
function prediction(placeId: string, main: string, secondary: string, types?: string[]) {
	return {
		placePrediction: {
			placeId,
			types,
			structuredFormat: {
				mainText: { text: main },
				secondaryText: { text: secondary }
			}
		}
	};
}

beforeEach(() => {
	mockEnv.GOOGLE_MAPS_API_KEY = 'test-api-key';
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('POST /api/places', () => {
	it('queryが空なら外部APIを叩かず空配列を返す', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const res = await POST(eventWith({ query: '' }));

		expect(await res.json()).toEqual({ suggestions: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('queryが2文字未満なら外部APIを叩かず空配列を返す', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const res = await POST(eventWith({ query: 'a' }));

		expect(await res.json()).toEqual({ suggestions: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('前後の空白を除くと2文字未満のqueryも空配列を返す', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const res = await POST(eventWith({ query: '  a  ' }));

		expect(await res.json()).toEqual({ suggestions: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('queryが未指定なら外部APIを叩かず空配列を返す', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const res = await POST(eventWith({}));

		expect(await res.json()).toEqual({ suggestions: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('APIキー未設定なら500を投げる', async () => {
		delete mockEnv.GOOGLE_MAPS_API_KEY;
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		await expect(POST(eventWith({ query: '東京駅' }))).rejects.toMatchObject({
			status: 500,
			body: { message: 'GOOGLE_MAPS_API_KEY is not set' }
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('候補を整形して返し、日本向けのパラメータでPlaces APIを呼ぶ', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					suggestions: [prediction('id-1', '東京駅', '東京都千代田区', ['train_station'])]
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchSpy);

		const res = await POST(eventWith({ query: '東京駅' }));

		expect(await res.json()).toEqual({
			suggestions: [{ placeId: 'id-1', name: '東京駅', displayAddress: '東京都千代田区' }]
		});

		const [url, init] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
		expect(init.headers['X-Goog-Api-Key']).toBe('test-api-key');
		expect(JSON.parse(init.body)).toEqual({
			input: '東京駅',
			languageCode: 'ja',
			regionCode: 'JP'
		});
	});

	it('行政区画など除外対象のtypesを持つ候補を取り除く', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						suggestions: [
							prediction('id-1', '東京都', '日本', ['administrative_area_level_1']),
							prediction('id-2', '東京駅', '東京都千代田区', ['train_station'])
						]
					}),
					{ status: 200 }
				)
			)
		);

		const res = await POST(eventWith({ query: '東京' }));

		expect(await res.json()).toEqual({
			suggestions: [{ placeId: 'id-2', name: '東京駅', displayAddress: '東京都千代田区' }]
		});
	});

	it('typesを持たない候補は除外せず残す', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(
						JSON.stringify({ suggestions: [prediction('id-1', '東京駅', '東京都千代田区')] }),
						{ status: 200 }
					)
				)
		);

		const res = await POST(eventWith({ query: '東京駅' }));

		expect(await res.json()).toEqual({
			suggestions: [{ placeId: 'id-1', name: '東京駅', displayAddress: '東京都千代田区' }]
		});
	});

	it('suggestionsキーが無いレスポンスでも空配列を返す', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
		);

		const res = await POST(eventWith({ query: '東京駅' }));

		expect(await res.json()).toEqual({ suggestions: [] });
	});

	it('Places APIがエラーを返したら502を投げ、生のエラー本文は返さない', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('quota exceeded: secret detail', { status: 429 }))
		);

		await expect(POST(eventWith({ query: '東京駅' }))).rejects.toMatchObject({
			status: 502,
			body: { message: 'Places API request failed' }
		});
	});
});
