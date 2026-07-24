/** Semantic color role for a status, mapped to design-system badge tokens in CSS. */
export type Tone = 'success' | 'danger' | 'warning' | 'running' | 'neutral';

/** Human-readable label + tone for a run/step status. */
const RUN: Record<string, { label: string; tone: Tone }> = {
	passed: { label: 'Passed', tone: 'success' },
	failed: { label: 'Failed', tone: 'danger' },
	errored: { label: 'Something went wrong', tone: 'warning' },
	running: { label: 'Running…', tone: 'running' },
	queued: { label: 'Waiting to start', tone: 'neutral' },
};

/**
 * Friendly label + semantic tone for a run status. Render with the global
 * `.badge` class and a `data-tone` attribute.
 *
 * @param status - the raw run status.
 * @returns `{ label, tone }`.
 */
export function runStatus(status: string): { label: string; tone: Tone } {
	return RUN[status] ?? { label: status, tone: 'neutral' };
}

const STEP: Record<string, { label: string; tone: Tone }> = {
	passed: { label: 'Passed', tone: 'success' },
	failed: { label: 'Failed', tone: 'danger' },
	skipped: { label: 'Skipped', tone: 'neutral' },
};

/**
 * Friendly label + semantic tone for a single step result.
 *
 * @param status - the raw step status.
 * @returns `{ label, tone }`.
 */
export function stepStatus(status: string): { label: string; tone: Tone } {
	return STEP[status] ?? { label: status, tone: 'neutral' };
}

/**
 * Strip ANSI color escape codes from a string. Playwright bakes them into its
 * error "Call log", which renders as `␛[2m` garbage in the browser. Worker-side
 * redaction now removes these, but this also cleans errors already persisted.
 *
 * @param s - the raw error string (or undefined).
 * @returns the string without ANSI codes, or undefined if none was given.
 */
export function stripAnsi(s: string | undefined): string | undefined {
	// eslint-disable-next-line no-control-regex
	return s?.replace(/\x1b\[[0-9;]*m/g, '');
}
