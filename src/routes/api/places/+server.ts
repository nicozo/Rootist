import { json, error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

interface PlacePrediction {
	placeId: string;
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
		error(502, "Places API request failed");
	}

	const data: AutocompleteResponse = await res.json();

	const suggestions = (data.suggestions ?? []).map(({ placePrediction: p }) => ({
		placeId: p.placeId,
		name: p.structuredFormat.mainText.text,
		displayAddress: p.structuredFormat.secondaryText.text
	}));

	return json({ suggestions });
};
