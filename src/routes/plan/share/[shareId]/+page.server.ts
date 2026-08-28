import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { plans } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import type { RouteResult } from '$lib/stores/route';

export const load: PageServerLoad = async ({ params }) => {
	const [record] = await db.select().from(plans).where(eq(plans.shareId, params.shareId)).limit(1);

	if (!record) {
		error(404, '共有されたプランが見つかりません');
	}

	return {
		result: record.data as RouteResult
	};
};
