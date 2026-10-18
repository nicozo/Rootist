import { command } from '$app/server';
import { savePlanSchema } from '#lib/schemas/plans.js';
import { savePlan as savePlanLogic } from '#lib/server/plan-sharing.js';

// プラン保存（DB 書き込み）。戻り値は { shareId }。
export const savePlan = command(savePlanSchema, savePlanLogic);
