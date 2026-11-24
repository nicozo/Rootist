import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// 登録は /login の「Googleでログイン」だけで済むので、古いリンクは /login へ移す（FR-009）。
// POST などは export しない（405。FR-011）。
export const GET: RequestHandler = () => {
	redirect(308, '/login');
};
