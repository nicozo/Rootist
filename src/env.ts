import { defineEnvVars } from '@sveltejs/kit/env';

// 未定義と空文字はどちらも「未設定」とみなす（空文字へのフォールバックはしない）。
// schema の検証は build 時と dev / 本番の起動時に走る（足りない変数がまとめて表示される）:
//   - 必須: schema が throw する。未設定のまま build / 起動できない
//   - 利用時必須: schema は undefined で通し、使う側（api/places・api/route）で検知する。起動は妨げない
//   - 任意: 未設定は undefined（無効扱い）
// `building` で build 時だけ任意にする方式は使わない（supabase.ts などがモジュール読み込み時に値を使うため、
// 環境変数なしの build は結局通らない）。
// 変数名の正は .env.example（一致は src/env.test.ts が検査する）。
const required = (name: string) => (input: string | undefined) => {
	if (!input) throw new Error(`${name} is not set`);
	return input;
};
const optional = (input: string | undefined) => (input ? input : undefined);

export const variables = defineEnvVars({
	// 必須
	DATABASE_URL: { schema: required('DATABASE_URL'), description: '必須。Postgres 接続文字列' },
	SUPABASE_URL: {
		schema: required('SUPABASE_URL'),
		description: '必須。Supabase プロジェクト URL'
	},
	SUPABASE_PUBLISHABLE_KEY: {
		schema: required('SUPABASE_PUBLISHABLE_KEY'),
		description: '必須。Supabase の publishable key'
	},
	// 利用時必須
	GOOGLE_MAPS_API_KEY: {
		schema: optional,
		description: '利用時必須。/api/places で使う Places API キー'
	},
	GEMINI_API_KEY: {
		schema: optional,
		description: '利用時必須。/api/route で使う Gemini API キー'
	},
	// 任意
	GOOGLE_AUTH_ENABLED: {
		schema: optional,
		description: '任意。"true" のときだけ Google ログインを有効にする（未設定は無効）'
	}
});
