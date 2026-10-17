import { error } from '@sveltejs/kit';
import { GOOGLE_MAPS_API_KEY } from '$app/env/private';
import type { PlacesSearchInput } from '#lib/schemas/places.js';

const EXCLUDED_TYPES = new Set([
	'administrative_area_level_1',
	'administrative_area_level_2',
	'locality',
	'sublocality',
	'sublocality_level_1',
	'country',
	'postal_code',
	'route',
	'political'
]);

interface PlacePrediction {
	placeId: string;
	types?: string[];
	structuredFormat: {
		mainText: { text: string };
		secondaryText: { text: string };
	};
}

interface AutocompleteResponse {
	suggestions?: { placePrediction: PlacePrediction }[];
}

export interface PlaceSuggestion {
	placeId: string;
	name: string;
	displayAddress: string;
}

/**
 * Google Places API (New) の住所検索（issue #159 で remote function の本体として移設）。
 * 2 文字未満・未指定は外部 API を呼ばずに空の候補を返す（キー未設定の判定より先）。
 */
export async function autocompletePlaces(
	input: PlacesSearchInput
): Promise<{ suggestions: PlaceSuggestion[] }> {
	const query = input?.query;

	if (!query || query.trim().length < 2) {
		return { suggestions: [] };
	}

	if (!GOOGLE_MAPS_API_KEY) {
		error(500, 'GOOGLE_MAPS_API_KEY is not set');
	}

	const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY
		},
		body: JSON.stringify({ input: query, languageCode: 'ja', regionCode: 'JP' })
	});

	if (!res.ok) {
		const errBody = await res.text();
		console.error('[Places API] error:', res.status, errBody);
		error(502, 'Places API request failed');
	}

	const data: AutocompleteResponse = await res.json();

	const suggestions = (data.suggestions ?? [])
		.filter(({ placePrediction: p }) => !p.types?.some((t) => EXCLUDED_TYPES.has(t)))
		.map(({ placePrediction: p }) => ({
			placeId: p.placeId,
			name: p.structuredFormat.mainText.text,
			displayAddress: p.structuredFormat.secondaryText.text
		}));

	return { suggestions };
}
