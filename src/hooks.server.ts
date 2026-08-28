import type { Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';

// issue #49: Better Auth公式のSvelteKit統合パターン。
// 1) auth.api.getSession()で既存と同じ形の event.locals.user / event.locals.session を設定する
//    （既存の+layout.server.ts・/login・/registerのloadがlocals.userを参照しているため契約を維持）
// 2) svelteKitHandlerでBetter AuthのHTTPエンドポイント（/api/auth/*）をマウントする
// ルートガードは実装しない（既存方針の維持）。hooksはlocals付与とBetter Authエンドポイントの
// 応答のみで、既存公開エンドポイント（/api/plans・/api/route・/plan/share/[shareId]等）の
// 認可・挙動には一切影響を与えない。
export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.user = { id: session.user.id, email: session.user.email };
		event.locals.session = { id: session.session.id, expiresAt: session.session.expiresAt };
	} else {
		event.locals.user = null;
		event.locals.session = null;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
