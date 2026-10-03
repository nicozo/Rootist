import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL },
	// Supabaseの管理スキーマ（auth / storage 等）を差分対象にしない
	schemaFilter: ['public'],
	verbose: true,
	strict: true
});
