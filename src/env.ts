import { defineEnvVars } from '@sveltejs/kit/env';

// 未定義と空文字はどちらも「未設定」とみなし undefined に揃える（空文字へのフォールバックはしない）。
// 未設定の検知は利用側で行う（ここで throw すると build / dev 起動で必須化してしまうため）:
//   - 必須: それを使うサーバーモジュールの読み込み時（lib/server/db・lib/server/supabase）
//   - 利用時必須: 該当 API の呼び出し時（api/places・api/route）。起動は妨げない
//   - 任意: 未設定は無効扱い
// 変数名の正は .env.example（一致は src/env.test.ts が検査する）。
const unsetToUndefined = (input: string | undefined) => (input ? input : undefined);

export const variables = defineEnvVars({
	// 必須
	DATABASE_URL: { schema: unsetToUndefined, description: '必須。Postgres 接続文字列' },
	SUPABASE_URL: { schema: unsetToUndefined, description: '必須。Supabase プロジェクト URL' },
	SUPABASE_PUBLISHABLE_KEY: {
		schema: unsetToUndefined,
		description: '必須。Supabase の publishable key'
	},
	// 利用時必須
	GOOGLE_MAPS_API_KEY: {
		schema: unsetToUndefined,
		description: '利用時必須。/api/places で使う Places API キー'
	},
	GEMINI_API_KEY: {
		schema: unsetToUndefined,
		description: '利用時必須。/api/route で使う Gemini API キー'
	},
	// 任意
	GOOGLE_AUTH_ENABLED: {
		schema: unsetToUndefined,
		description: '任意。"true" のときだけ Google ログインを有効にする（未設定は無効）'
	}
});
