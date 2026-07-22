import { z } from 'zod';

/**
 * Per-test run configuration, applied by the worker when it builds the browser context.
 * All fields are optional — an unset field keeps Playwright's default.
 */
export const testSettingsSchema = z.object({
	viewport: z.string().optional(),
	/** Browsers to run on; each adds a concurrent run (default chromium). */
	browsers: z.array(z.enum(['chromium', 'firefox', 'webkit'])).optional(),
	userAgent: z.string().optional(),
	/** BCP-47 locale; sets navigator.language and the Accept-Language header. */
	language: z.string().optional(),
	basicAuth: z.object({ username: z.string(), password: z.string() }).optional(),
	/** Max time (ms) to find an element before failing. */
	elementTimeoutMs: z.number().int().positive().optional(),
	/** Pause (ms) inserted after each step. */
	stepDelayMs: z.number().int().nonnegative().optional(),
	/** Fail the run if the page logs an uncaught JS error. */
	failOnJsError: z.boolean().optional(),
	/** Re-run once automatically on failure (cuts false positives). */
	retry: z.boolean().optional(),
	/** Log in first using this login flow's captured session (id). */
	loginFlowId: z.string().optional(),
	/** Extra HTTP headers sent with every request. */
	headers: z.record(z.string(), z.string()).optional(),
});

export type TestSettings = z.infer<typeof testSettingsSchema>;

/** Parse a settings JSON string, tolerating null/empty (returns {}). */
export function parseSettings(input: string | null | undefined): TestSettings {
	if (!input) return {};
	return testSettingsSchema.parse(JSON.parse(input));
}
