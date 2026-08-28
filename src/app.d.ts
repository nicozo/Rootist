// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// issue #49: Better Auth移行によりuser.idは文字列ID（UUID）になる
			// issue #54: アバター表示のためname/imageを追加（DBスキーマ変更なし、既存のBetter Auth標準フィールド）
			user: { id: string; email: string; name: string; image: string | null } | null;
			session: { id: string; expiresAt: Date } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
