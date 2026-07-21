/** Human-readable label + badge styling for a run/step status. */
const RUN: Record<string, { label: string; badge: string }> = {
	passed: { label: 'Passed', badge: 'bg-emerald-500/15 text-emerald-300' },
	failed: { label: 'Failed', badge: 'bg-red-500/15 text-red-300' },
	errored: { label: 'Something went wrong', badge: 'bg-amber-500/15 text-amber-300' },
	running: { label: 'Running…', badge: 'bg-sky-500/15 text-sky-300' },
	queued: { label: 'Waiting to start', badge: 'bg-white/10 text-white/50' },
};

/**
 * Friendly label + badge classes for a run status.
 *
 * @param status - the raw run status.
 * @returns `{ label, badge }` — plain-language text and Tailwind badge classes.
 */
export function runStatus(status: string): { label: string; badge: string } {
	return RUN[status] ?? { label: status, badge: 'bg-white/10 text-white/50' };
}

const STEP: Record<string, { label: string; cls: string }> = {
	passed: { label: '✓ passed', cls: 'text-emerald-300' },
	failed: { label: '✕ failed', cls: 'text-red-300' },
	skipped: { label: 'skipped', cls: 'text-white/40' },
};

/**
 * Friendly label + text color for a single step result.
 *
 * @param status - the raw step status.
 * @returns `{ label, cls }`.
 */
export function stepStatus(status: string): { label: string; cls: string } {
	return STEP[status] ?? { label: status, cls: 'text-white/40' };
}
