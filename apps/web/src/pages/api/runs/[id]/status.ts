import type { APIRoute } from 'astro';
import { json } from '../../../../server/api';
import { createCaller } from '../../../../server/routers';
import { stripAnsi } from '../../../../lib/status';

/**
 * GET /api/runs/:id/status — a lightweight, same-origin snapshot of a run's live
 * state, for the in-progress poller on the run page. Returns just what the poller
 * patches into the DOM (no artifacts/trace/triage), so an in-progress run updates
 * in place instead of a full `location.reload()` (which flickers). Errors are
 * ANSI-stripped, matching how the page renders them.
 */
export const GET: APIRoute = async ({ params }) => {
	const id = params.id;
	if (!id) return json({ error: 'not found' }, 404);

	const data = await createCaller().runs.get({ id });
	if (!data?.run) return json({ error: 'not found' }, 404);

	const { run, steps } = data;
	const inProgress = run.status === 'queued' || run.status === 'running';

	return json({
		inProgress,
		status: run.status,
		// Epoch-ms timestamps drive the live duration ticker (elapsed since startedAt)
		// and let the client reconcile to the exact wall-clock time once finished.
		startedAt: run.startedAt?.getTime() ?? null,
		finishedAt: run.finishedAt?.getTime() ?? null,
		error: stripAnsi(run.error ?? undefined) ?? null,
		steps: steps.map((s) => ({
			idx: s.idx,
			status: s.status,
			durationMs: s.durationMs ?? null,
			error: stripAnsi(s.error ?? undefined) ?? null,
		})),
	});
};
