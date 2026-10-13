// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// issue #116: リクエストごとに hooks で作るSupabaseサーバー用クライアント
			supabase: SupabaseClient;
			// issue #116: user.idはSupabase Auth（auth.users）のUUID文字列。
			// name/imageはuser_metadataから決める（#lib/server/auth-user.ts）
			user: { id: string; email: string; name: string; image: string | null } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
