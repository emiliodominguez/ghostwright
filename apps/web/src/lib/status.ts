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
	passed: { label: 'passed', tone: 'success' },
	failed: { label: 'failed', tone: 'danger' },
	skipped: { label: 'skipped', tone: 'neutral' },
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
