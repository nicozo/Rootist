import { json, error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

interface Location {
	name: string;
	displayAddress: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const { locations }: { locations: Location[] } = await request.json();

	if (!locations || locations.length < 2) {
		error(400, "2件以上の目的地が必要です");
	}

	const locationList = locations
		.map((l, i) => `${i + 1}. ${l.name}（${l.displayAddress}）`)
		.join("\n");

	const prompt = `あなたは旅行プランナーです。以下の目的地を1日で効率よく巡る最適ルートと時刻スケジュールを生成してください。移動時間も考慮して、現実的なスケジュールを組んでください。

目的地:
${locationList}

以下のJSON形式のみで回答してください:
{
  "destinations": [
    {
      "order": 1,
      "name": "場所名",
      "displayAddress": "住所",
      "arrivalTime": "09:00",
      "departureTime": "10:30",
      "description": "見どころや滞在時のポイント（100文字以内）"
    }
  ],
  "summary": "全体の旅程概要（200文字以内）"
}`;

	const res = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: { responseMimeType: "application/json" }
			})
		}
	);

	if (!res.ok) {
		const errBody = await res.text();
		console.error("[Gemini API] error:", res.status, errBody);
		error(502, "ルート生成に失敗しました");
	}

	const data = await res.json();
	const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

	let routeData;
	try {
		routeData = JSON.parse(text);
	} catch {
		error(500, "ルート生成に失敗しました");
	}

	return json(routeData);
};
