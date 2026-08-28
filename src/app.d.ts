// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// issue #49: Better Auth移行によりuser.idは文字列ID（UUID）になる
			user: { id: string; email: string } | null;
			session: { id: string; expiresAt: Date } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
