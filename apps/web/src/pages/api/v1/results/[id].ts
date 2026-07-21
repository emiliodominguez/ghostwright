import type { APIRoute } from 'astro';
import { authApiKey, json, resultJson, unauthorized } from '../../../../server/api';

/** GET /api/v1/results/:id — a run's result. */
export const GET: APIRoute = async ({ request, url, params }) => {
	if (!(await authApiKey(request, url))) return unauthorized();
	const result = await resultJson(params.id!);
	if (!result) return json({ error: 'not found' }, 404);
	return json(result);
};
