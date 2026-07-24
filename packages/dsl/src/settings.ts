import { z } from 'zod';

/** Every browser engine the DSL knows about. */
export const BROWSERS = ['chromium', 'firefox', 'webkit'] as const;
export type Browser = (typeof BROWSERS)[number];

/**
 * Browsers temporarily unavailable to run (shown as "coming soon" in the UI and
 * dropped from a run's browser list on the server). WebKit's binary cannot launch
 * in the current environment, so it is disabled until that is resolved.
 */
export const DISABLED_BROWSERS: readonly Browser[] = ['webkit'];

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
	/**
	 * Re-run once automatically on failure (cuts false positives). Legacy boolean;
	 * prefer `retryOnFail`. When true it is treated as `retryOnFail: 1`.
	 */
	retry: z.boolean().optional(),
	/** Re-run the whole test up to this many extra times if it fails (0 = never). */
	retryOnFail: z.number().int().nonnegative().optional(),
	/** Wait this long (ms) before each whole-run retry. */
	retryDelayMs: z.number().int().nonnegative().optional(),
	/**
	 * Default extra attempts for every step in this test if a step throws (0 = off).
	 * A step's own `retries` overrides this. This is the per-suite/test default, opt-in.
	 */
	stepRetries: z.number().int().nonnegative().optional(),
	/** Default delay (ms) between step retry attempts. A step's own `retryDelayMs` overrides this. */
	stepRetryDelayMs: z.number().int().nonnegative().optional(),
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
