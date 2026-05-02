import { json, error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

const EXCLUDED_TYPES = new Set([
	"administrative_area_level_1",
	"administrative_area_level_2",
	"locality",
	"sublocality",
	"sublocality_level_1",
	"country",
	"postal_code",
	"route",
	"political"
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

export const POST: RequestHandler = async ({ request }) => {
	const { query } = await request.json();

	if (!query || query.trim().length < 2) {
		return json({ suggestions: [] });
	}

	const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY
		},
		body: JSON.stringify({ input: query, languageCode: "ja" })
	});

	if (!res.ok) {
		const errBody = await res.text();
		console.error("[Places API] error:", res.status, errBody);
		error(502, "Places API request failed");
	}

	const data: AutocompleteResponse = await res.json();

	const suggestions = (data.suggestions ?? [])
		.filter(({ placePrediction: p }) => !p.types?.some((t) => EXCLUDED_TYPES.has(t)))
		.map(({ placePrediction: p }) => ({
			placeId: p.placeId,
			name: p.structuredFormat.mainText.text,
			displayAddress: p.structuredFormat.secondaryText.text
		}));

	return json({ suggestions });
};
