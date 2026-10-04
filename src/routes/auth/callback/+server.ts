import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// SupabaseのGoogle認証から戻ってくる口。認可コードをセッションに交換する（PKCE）。
// キャンセル・失敗はいずれも /login?error=google に戻し、生のエラー内容は画面に出さない。
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	let signedIn = false;

	if (code && !url.searchParams.has('error')) {
		try {
			const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
			if (error) {
				console.error('google callback: exchangeCodeForSession failed', { code: error.code });
			} else {
				signedIn = true;
			}
		} catch (err) {
			console.error('google callback: unexpected exception', err);
		}
	}

	// redirectはtry/catchの外（リダイレクトの例外を誤って捕捉しないため）
	redirect(303, signedIn ? '/plan' : '/login?error=google');
};
