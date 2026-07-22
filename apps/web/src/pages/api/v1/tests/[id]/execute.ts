import type { APIRoute } from 'astro';
import { authApiKey, enqueueRun, json, resultJson, unauthorized, waitForRun } from '../../../../../server/api';

/**
 * POST /api/v1/tests/:id/execute — run a test. Waits for the result by default;
 * `?immediate=1` returns the run id without waiting (poll GET /api/v1/results/:id later).
 * POST-only: executing is side-effecting, so it must not be triggerable by a GET/prefetch.
 */
export const POST: APIRoute = async ({ request, url, params }) => {
	if (!(await authApiKey(request, url))) return unauthorized();
	const runId = await enqueueRun(params.id!);
	if (!runId) return json({ error: 'test not found or has no version' }, 404);

	if (url.searchParams.get('immediate') === '1') return json({ id: runId, status: 'queued' }, 202);
	await waitForRun(runId);
	return json((await resultJson(runId)) ?? { id: runId, status: 'unknown' });
};
