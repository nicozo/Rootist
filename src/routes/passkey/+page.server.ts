import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { describeAuthError } from '#lib/server/auth-errors.js';
import {
	PASSKEY_PROMPT_DISMISSALS_KEY,
	readPasskeyPromptDismissals
} from '#lib/server/post-login.js';

// パスキー登録の案内。ログイン必須（未ログインは /login へ）。
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}
	return {};
};

export const actions: Actions = {
	// 「あとで」: 見送り回数を 1 増やして /plan へ（FR-015, FR-027）。保存に失敗しても利用者を止めない
	dismiss: async ({ locals }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		try {
			const { data, error } = await locals.supabase.auth.getUser();
			if (error || !data.user) {
				if (error) console.error('passkey dismiss: getUser failed', describeAuthError(error));
			} else {
				const dismissals = readPasskeyPromptDismissals(data.user.user_metadata) + 1;
				const { error: updateError } = await locals.supabase.auth.updateUser({
					data: { [PASSKEY_PROMPT_DISMISSALS_KEY]: dismissals }
				});
				if (updateError) {
					console.error('passkey dismiss: updateUser failed', describeAuthError(updateError));
				}
			}
		} catch (err) {
			console.error('passkey dismiss: unexpected exception', {
				name: err instanceof Error ? err.name : typeof err
			});
		}

		redirect(303, '/plan');
	}
};
