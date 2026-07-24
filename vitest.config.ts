import { defineConfig } from 'vitest/config';

// Root test runner + coverage. Tests live next to the code they cover (a file's tests
// nest under it via the same base name, e.g. status.ts + status.test.ts), matching the
// editor's file-nesting config.
//
// Coverage is measured over the pure-logic units that are meaningfully unit-testable:
// the shared packages and the framework-free helpers in the apps. UI islands, Astro
// pages, and the infrastructure-bound process entrypoints (which need a real browser,
// database, Redis, or object store) are excluded from the coverage denominator rather
// than faked, so the percentage reflects logic actually exercised by tests.
export default defineConfig({
	test: {
		include: ['**/*.{test,spec}.{ts,tsx}'],
		exclude: ['**/node_modules/**', '**/dist/**', '**/.astro/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary', 'html'],
			all: true,
			include: [
				'packages/dsl/src/**/*.ts',
				'packages/crypto/src/**/*.ts',
				'packages/queue/src/**/*.ts',
				'packages/logger/src/**/*.ts',
				'apps/web/src/lib/**/*.ts',
				'apps/web/src/server/dataRows.ts',
				'apps/web/src/server/api.ts',
				'apps/worker/src/net-guard.ts',
				'apps/worker/src/variables.ts',
				'apps/worker/src/queue.ts',
			],
			exclude: [
				'**/*.{test,spec}.{ts,tsx}',
				'**/dist/**',
				// Barrel re-exports and the dsl public index carry no logic of their own.
				'packages/dsl/src/index.ts',
				'apps/web/src/lib/trpc.ts',
				'apps/web/src/server/trpc.ts',
			],
			thresholds: {
				lines: 95,
				functions: 95,
				statements: 95,
				branches: 90,
			},
		},
	},
});
