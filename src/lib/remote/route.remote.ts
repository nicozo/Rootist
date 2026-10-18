import { command } from '$app/server';
import { routeGenerationSchema } from '#lib/schemas/route.js';
import { generateRoute as generateRouteLogic } from '#lib/server/route-generation.js';

// ルート生成（課金のある LLM 呼び出し。結果は毎回変わる）。キャッシュ・重複排除の対象にならない command にする。
export const generateRoute = command(routeGenerationSchema, generateRouteLogic);
