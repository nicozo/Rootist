import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isPlaceId, isSessionToken } from '$lib/server/places';

interface PlaceDetailsResponse {
	location?: { latitude?: number; longitude?: number };
}

/** 選ばれた候補の座標を取得する。FieldMask を location だけに絞り、最も安い SKU で呼ぶ */
export const POST: RequestHandler = async ({ request }) => {
	const { placeId, sessionToken } = await request.json();

	if (!isPlaceId(placeId)) {
		error(400, 'placeId が不正です');
	}

	if (!env.GOOGLE_MAPS_API_KEY) {
		error(500, 'GOOGLE_MAPS_API_KEY is not set');
	}

	const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
	if (isSessionToken(sessionToken)) url.searchParams.set('sessionToken', sessionToken);

	const res = await fetch(url, {
		headers: {
			'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
			'X-Goog-FieldMask': 'location'
		}
	});

	if (!res.ok) {
		const errBody = await res.text();
		console.error('[Places API] details error:', res.status, errBody);
		error(502, 'Places API request failed');
	}

	const data: PlaceDetailsResponse = await res.json();
	const lat = data.location?.latitude;
	const lng = data.location?.longitude;
	if (typeof lat !== 'number' || typeof lng !== 'number') {
		error(502, 'Places API response has no location');
	}

	return json({ location: { lat, lng } });
};
