// issue #189: ログイン直後の行き先の判定（パスキー登録の案内を出すか）。
// メールのコードと Google のログインが共通で使う。パスキーでのログインは持っている人なので使わない。
import type { SupabaseServerClient } from '#lib/server/supabase.js';
import { describeAuthError } from '#lib/server/auth-errors.js';

/** 案内の見送りを数える user_metadata のキー（data-model.md） */
export const PASSKEY_PROMPT_DISMISSALS_KEY = 'passkey_prompt_dismissals';

/** 「あとで」がこの回数に達したら案内を出さない（FR-027） */
export const MAX_PASSKEY_PROMPT_DISMISSALS = 3;

/** user_metadata から見送り回数を読む。数値（0 以上の整数）でなければ 0 と見なす */
export function readPasskeyPromptDismissals(metadata: Record<string, unknown> | undefined): number {
	const value = metadata?.[PASSKEY_PROMPT_DISMISSALS_KEY];
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * ログイン直後の行き先。パスキーが 0 件で見送りが 3 回未満なら案内の `/passkey`、それ以外は `/plan`。
 * 一覧・ユーザーの取得に失敗したときや例外のときも、ログインを妨げないよう `/plan` にする。
 */
export async function resolvePostLoginPath(
	supabase: Pick<SupabaseServerClient, 'auth'>
): Promise<'/passkey' | '/plan'> {
	try {
		const { data: passkeys, error: listError } = await supabase.auth.passkey.list();
		if (listError) {
			console.error('post-login: passkey.list failed', describeAuthError(listError));
			return '/plan';
		}
		if (passkeys.length > 0) return '/plan';

		const { data, error: userError } = await supabase.auth.getUser();
		if (userError || !data.user) {
			if (userError) console.error('post-login: getUser failed', describeAuthError(userError));
			return '/plan';
		}
		const dismissals = readPasskeyPromptDismissals(data.user.user_metadata);
		return dismissals < MAX_PASSKEY_PROMPT_DISMISSALS ? '/passkey' : '/plan';
	} catch (err) {
		console.error('post-login: unexpected exception', {
			name: err instanceof Error ? err.name : typeof err
		});
		return '/plan';
	}
}
