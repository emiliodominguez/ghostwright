import { db, tables } from '@ghostwright/db';
import { eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { authApiKey, json, unauthorized } from '../../../../server/api';

/** GET /api/v1/tests/:id — the test, plus its DSL as `steps` (the export format). */
export const GET: APIRoute = async ({ request, url, params }) => {
	if (!(await authApiKey(request, url))) return unauthorized();
	const test = await db.query.test.findFirst({ where: eq(tables.test.id, params.id!) });
	if (!test) return json({ error: 'not found' }, 404);
	const version = test.currentVersionId
		? await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, test.currentVersionId) })
		: null;
	const dsl = version ? JSON.parse(version.dsl) : { steps: [] };
	return json({ id: test.id, name: test.name, settings: test.settings ? JSON.parse(test.settings) : {}, ...dsl });
};
