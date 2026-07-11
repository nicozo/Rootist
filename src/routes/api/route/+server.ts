import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface Location {
	name: string;
	displayAddress: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const {
		locations,
		origin,
		transportMode,
		startTime,
		endDestination
	}: {
		locations: Location[];
		origin?: Location;
		transportMode?: string;
		startTime?: string;
		endDestination?: Location;
	} = await request.json();

	if (!locations || locations.length < 2) {
		error(400, '2件以上の目的地が必要です');
	}

	// 出発地: 指定時のみ注入（省略方式）
	const originLine = origin
		? `出発地: ${origin.name}（${origin.displayAddress}）\n` +
			`※ 出発地は観光スポットとして扱わず、訪問リストには含めないこと。ルートはこの地点から開始し、最初の目的地への移動時間・手段は出発地を起点に見積もること。\n`
		: '';

	// 移動手段: 未選択時は「指定なし」を明示（明示方式）
	const transportLine = transportMode
		? (() => {
				const modeMap: Record<string, string> = {
					transit: '電車・公共交通（駅・バス停ベースの移動と乗り換え待ち時間を考慮すること）',
					car: '車（道路移動を前提とし、駐車時間も考慮すること。transitRoute は全区間 null にすること）',
					walking:
						'徒歩（徒歩圏として現実的な距離のみ許容すること。非現実的な徒歩距離になる場合はその旨を所要時間に反映すること。transitRoute は全区間 null にすること）'
				};
				return `移動手段: ${modeMap[transportMode] ?? transportMode}\n`;
			})()
		: '移動手段: 指定なし。目的地間の距離・立地から最適な手段を選んでよい。\n';

	// 開始時間: 未指定時はデフォルト09:00を明示（明示方式）
	const startTimeLine = startTime
		? `開始時間: ${startTime}\n`
		: '開始時間: 09:00（未指定のためデフォルト）\n';

	// 終点: 指定時のみ注入（省略方式）
	const endDestinationLine = endDestination
		? `終点（宿泊先等）: ${endDestination.name}（${endDestination.displayAddress}）\n` +
			`※ 終点は訪問スポットではなく最終到達点であること。最後の目的地から終点への移動も行程（移動時間）に含めること。終点は destinations 配列に含めないこと。\n`
		: '';

	const locationList = locations
		.map((l, i) => `${i + 1}. ${l.name}（${l.displayAddress}）`)
		.join('\n');

	const prompt = `あなたは旅行プランナーです。以下の目的地を1日で効率よく巡る最適ルートと時刻スケジュールを生成してください。移動時間・路線も考慮して、現実的なスケジュールを組んでください。

${originLine}${transportLine}${startTimeLine}${endDestinationLine}目的地:
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
      "description": "見どころや滞在時のポイント（100文字以内）",
      "travelTimeFromPrevious": "半蔵門線で約19分（押上駅下車）",
      "transitRoute": "半蔵門線（押上駅下車）"
    },
    {
      "order": 2,
      "name": "場所名",
      "displayAddress": "住所",
      "arrivalTime": "11:00",
      "departureTime": "12:30",
      "description": "見どころや滞在時のポイント（100文字以内）",
      "travelTimeFromPrevious": "徒歩で約10分",
      "transitRoute": null
    }
  ],
  "summary": "全体の旅程概要（200文字以内）"
}
※ travelTimeFromPrevious は全ての目的地に必ず記載してください。1番目は出発地（または旅の起点）からの移動時間、2番目以降は前の目的地からの移動時間を記載してください。
※ 電車・公共交通の場合は「○○線で約X分（△△駅下車）」のように路線名と降車駅を含めてください。徒歩・車の場合は「徒歩で約X分」「車で約X分」の形式で記載してください。
※ transitRoute は電車・公共交通を利用した区間のみ路線名と降車駅を記載し（例: "半蔵門線（押上駅下車）"）、徒歩・車の場合は null にしてください。移動手段が未指定の場合はモデルが公共交通を選んだ区間にのみ付与してください。実在が不確かな路線・駅名は記載せず省略してください。`;

	const res = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: { responseMimeType: 'application/json' }
			})
		}
	);

	if (!res.ok) {
		const errBody = await res.text();
		console.error('[Gemini API] error:', res.status, errBody);
		error(502, 'ルート生成に失敗しました');
	}

	const data = await res.json();
	const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

	let routeData;
	try {
		routeData = JSON.parse(text);
	} catch {
		error(500, 'ルート生成に失敗しました');
	}

	return json({
		...routeData,
		origin,
		transportMode: transportMode ?? null,
		startTime: startTime ?? null,
		endDestination: endDestination ?? null
	});
};
