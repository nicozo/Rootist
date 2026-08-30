import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isStayMinutesPreset, formatStayMinutes } from '$lib/stay-minutes';
import { isVisitTime, parseTimeToMinutes } from '$lib/visit-time';

type TimeSlot = 'morning' | 'noon' | 'night';

interface Location {
	name: string;
	displayAddress: string;
	timeSlot?: TimeSlot;
	stayMinutes?: number;
	arriveAt?: string;
}

/** モデル出力のarrivalTime〜departureTimeから実際の滞在分数を算出する。解釈できなければnull。 */
function actualStayMinutes(arrivalTime: unknown, departureTime: unknown): number | null {
	const arrival = parseTimeToMinutes(arrivalTime);
	const departure = parseTimeToMinutes(departureTime);
	if (arrival === null || departure === null) return null;
	return departure - arrival;
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

	// 時間帯: whitelist（4値）以外は undefined として無視（プロンプト汚染防止）
	const validSlots = new Set<TimeSlot>(['morning', 'noon', 'night']);
	// 滞在時間: プリセットのwhitelist以外は undefined として無視（プロンプト汚染防止）
	// 訪問時刻: 厳密な "HH:MM"（00:00〜23:59）以外は undefined として無視（プロンプト汚染防止）
	const normalizedLocations = locations.map((l) => {
		const arriveAt = isVisitTime(l.arriveAt) ? l.arriveAt : undefined;
		return {
			...l,
			// 訪問時刻は時間帯より強い指定なので、両方来た場合は時刻を優先し時間帯は捨てる
			// （矛盾した指示をプロンプトに同時に載せないため）
			timeSlot: !arriveAt && l.timeSlot && validSlots.has(l.timeSlot) ? l.timeSlot : undefined,
			stayMinutes: isStayMinutesPreset(l.stayMinutes) ? l.stayMinutes : undefined,
			arriveAt
		};
	});

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

	// 時間帯: 1件以上指定がある場合のみ制約セクションを注入（省略方式）
	const slotJa: Record<TimeSlot, string> = {
		morning: '朝（6:00〜10:59）',
		noon: '昼（11:00〜16:59）',
		night: '晩（17:00以降）'
	};
	const hasTimeSlot = normalizedLocations.some((l) => l.timeSlot);
	const timeSlotLine = hasTimeSlot
		? `時間帯の希望:\n` +
			`※ 【希望時間帯】が付いた目的地は、必ずその時間帯内に滞在（arrivalTime〜departureTime の大部分）が収まるように訪問順序とスケジュールを組むこと。距離的に遠回りになっても時間帯の希望を優先すること。\n` +
			`※ 時間帯の定義: 朝=6:00〜10:59 / 昼=11:00〜16:59 / 晩=17:00以降。\n` +
			`※ 希望時間帯の指定がない目的地は、移動距離・移動時間が最短になるよう自由に配置してよい。\n` +
			`※ 開始時間の制約により希望時間帯を完全には満たせない場合（例: 開始が15:00なのに「朝」指定がある等）は、開始時間を優先しつつ可能な限り希望時間帯に近い時刻に配置し、summary でその旨に触れること。\n`
		: '';

	// 滞在時間: 1件以上指定がある場合のみ制約セクションを注入（省略方式）
	const hasStayMinutes = normalizedLocations.some((l) => l.stayMinutes);
	const stayMinutesLine = hasStayMinutes
		? `滞在時間の希望:\n` +
			`※ 【希望滞在時間】が付いた目的地は、その滞在時間（arrivalTime〜departureTimeの差）を指定された分数にできる限り正確に一致させること。\n` +
			`※ 滞在時間の指定は、その目的地にとどまる長さのみを指定するものであり、訪問順序（何番目に訪れるか）を変える理由にはならないこと。訪問順序は引き続き移動距離・移動時間が最短になるように決定すること。\n` +
			`※ 時間帯と滞在時間の両方が指定された目的地は、指定された時間帯の範囲内に指定された滞在時間がすべて収まるように配置すること。\n` +
			`※ 指定された滞在時間の合計が1日のスケジュールに収まらない場合は、開始時刻を優先しつつ滞在時間を可能な範囲で調整し、その旨を summary に明記すること。\n`
		: '';

	// 訪問時刻: 1件以上指定がある場合のみ制約セクションを注入（省略方式）
	const hasArriveAt = normalizedLocations.some((l) => l.arriveAt);
	const arriveAtLine = hasArriveAt
		? `訪問時刻の希望:\n` +
			`※ 【希望訪問時刻】が付いた目的地は、arrivalTime をその時刻に必ず一致させること。\n` +
			`※ 訪問時刻の指定は最優先の制約であること。移動距離・移動時間の最短化よりも指定時刻を優先し、遠回りになっても指定時刻に到着できる訪問順序を組むこと。\n` +
			`※ 訪問時刻の指定がない目的地は、指定時刻の目的地を軸にして、その前後を移動距離・移動時間が最短になるよう自由に配置してよい。\n` +
			`※ 指定時刻までに空き時間が生じる場合は、他の目的地の滞在時間を延ばすか待ち時間として扱い、指定時刻をずらさないこと。\n` +
			`※ 複数の指定時刻が移動時間の都合で両立しない場合や、開始時間より前の指定時刻がある場合など、指定どおりに組めないときは、可能な限り指定時刻に近い時刻に配置し、どの指定を満たせなかったかを summary に明記すること。\n`
		: '';

	const locationList = normalizedLocations
		.map(
			(l, i) =>
				`${i + 1}. ${l.name}（${l.displayAddress}）` +
				(l.timeSlot ? `【希望時間帯: ${slotJa[l.timeSlot]}】` : '') +
				(l.stayMinutes ? `【希望滞在時間: ${formatStayMinutes(l.stayMinutes)}】` : '') +
				(l.arriveAt ? `【希望訪問時刻: ${l.arriveAt}】` : '')
		)
		.join('\n');

	const prompt = `あなたは旅行プランナーです。以下の目的地を1日で効率よく巡る最適ルートと時刻スケジュールを生成してください。移動時間・路線も考慮して、現実的なスケジュールを組んでください。

${originLine}${transportLine}${startTimeLine}${endDestinationLine}${timeSlotLine}${stayMinutesLine}${arriveAtLine}目的地:
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

	// timeSlot はモデル出力を信頼せず、ユーザー入力を name 一致で権威付与する
	// （モデルが指定を欠落させたり無指定に捏造値を付けたりしても表示が実入力と一致する）
	const slotByName = new Map(
		normalizedLocations.filter((l) => l.timeSlot).map((l) => [l.name, l.timeSlot as TimeSlot])
	);
	// stayMinutes も同様にユーザー入力を name 一致で権威付与する（表示用エコーバック）。
	// ただしtimeSlotと異なり、arrivalTime/departureTimeの実計算には関与しない（サーバー側での
	// スケジュール再計算はスコープ外。2-6参照）。デグレ検知のため、モデル出力の実際の滞在時間との
	// 差が15分を超える場合はconsole.errorに残す。
	const stayByName = new Map(
		normalizedLocations.filter((l) => l.stayMinutes).map((l) => [l.name, l.stayMinutes as number])
	);
	// arriveAt も同様にユーザー入力を name 一致で権威付与する（表示用エコーバック）。
	// stayMinutes と同じく、モデル出力の arrivalTime との乖離が15分を超える場合はconsole.errorに残す。
	const arriveAtByName = new Map(
		normalizedLocations.filter((l) => l.arriveAt).map((l) => [l.name, l.arriveAt as string])
	);
	if (Array.isArray(routeData?.destinations)) {
		routeData.destinations = routeData.destinations.map(
			(d: {
				name?: string;
				arrivalTime?: string;
				departureTime?: string;
				[k: string]: unknown;
			}) => {
				const stayMinutes = stayByName.get(d.name ?? '') ?? null;
				if (stayMinutes !== null) {
					const actual = actualStayMinutes(d.arrivalTime, d.departureTime);
					if (actual !== null && Math.abs(actual - stayMinutes) > 15) {
						console.error(
							'[Gemini API] stayMinutes mismatch:',
							d.name,
							'requested=',
							stayMinutes,
							'actual=',
							actual
						);
					}
				}
				const arriveAt = arriveAtByName.get(d.name ?? '') ?? null;
				if (arriveAt !== null) {
					const requested = parseTimeToMinutes(arriveAt);
					const actual = parseTimeToMinutes(d.arrivalTime);
					if (requested !== null && actual !== null && Math.abs(actual - requested) > 15) {
						console.error(
							'[Gemini API] arriveAt mismatch:',
							d.name,
							'requested=',
							arriveAt,
							'actual=',
							d.arrivalTime
						);
					}
				}
				return {
					...d,
					timeSlot: slotByName.get(d.name ?? '') ?? null,
					stayMinutes,
					arriveAt
				};
			}
		);
	}

	return json({
		...routeData,
		origin,
		transportMode: transportMode ?? null,
		startTime: startTime ?? null,
		endDestination: endDestination ?? null
	});
};
