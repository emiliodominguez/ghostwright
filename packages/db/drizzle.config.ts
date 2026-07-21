import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/schema.ts',
	out: './migrations',
	dialect: 'turso',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'http://localhost:8080',
		authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
	},
});
