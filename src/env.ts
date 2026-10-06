import { defineEnvVars } from '@sveltejs/kit/env';

// @migration-task Review usage of dynamic environment variables. They fall back to the empty string if not present, which may not be what you want.
export const variables = defineEnvVars({
	GEMINI_API_KEY: { schema: (input) => input ?? '' },
	GOOGLE_MAPS_API_KEY: { schema: (input) => input ?? '' },
	SUPABASE_URL: { schema: (input) => input ?? '' },
	SUPABASE_PUBLISHABLE_KEY: { schema: (input) => input ?? '' },
	GOOGLE_AUTH_ENABLED: { schema: (input) => input ?? '' },
	DATABASE_URL: { schema: (input) => input ?? '' }
});
