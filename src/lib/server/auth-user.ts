// issue #116: Supabaseのユーザー情報から locals.user を作る純粋関数。
// DB・Supabase・$env に依存しない（型のみimport）ため単体テストできる。
import type { User } from '@supabase/supabase-js';

export type AppUser = { id: string; email: string; name: string; image: string | null };

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

// user_metadata は利用者本人が書き換え得る値のため、javascript: 等を <img src> に流さないよう
// https:// で始まるものだけを採用する。
function httpsUrl(value: unknown): string | null {
	const s = nonEmptyString(value);
	return s !== null && s.startsWith('https://') ? s : null;
}

/**
 * 表示名: user_metadata.name → full_name → メールのローカル部。
 * full_name / avatar_url / picture は #117 のGoogleログインでSupabaseが入れる項目（受け口のみ先に用意）。
 */
export function resolveDisplayName(metadata: Record<string, unknown>, email: string): string {
	const local = email.split('@')[0];
	return (
		nonEmptyString(metadata.name) ??
		nonEmptyString(metadata.full_name) ??
		(local && local.length > 0 ? local : email)
	);
}

/** 画像: user_metadata.avatar_url → picture（いずれも https:// のみ）→ null */
export function resolveImage(metadata: Record<string, unknown>): string | null {
	return httpsUrl(metadata.avatar_url) ?? httpsUrl(metadata.picture);
}

/**
 * Supabaseのユーザーを locals.user に変換する。idはSupabase（auth.users）のUUID文字列。
 * emailが無いユーザーは未ログイン扱い（null）にする（Locals.user.email は string のため）。
 */
export function toAppUser(user: User | null | undefined): AppUser | null {
	if (!user || typeof user.email !== 'string' || user.email.length === 0) return null;
	const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
	return {
		id: user.id,
		email: user.email,
		name: resolveDisplayName(metadata, user.email),
		image: resolveImage(metadata)
	};
}
