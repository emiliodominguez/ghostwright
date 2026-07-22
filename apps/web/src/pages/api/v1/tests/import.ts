import { db, tables } from '@ghostwright/db';
import { parseTest } from '@ghostwright/dsl';
import { eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { authApiKey, json, unauthorized } from '../../../../server/api';

/** POST /api/v1/tests/import — create a test from JSON `{ name, steps }` (the export format). */
export const POST: APIRoute = async ({ request, url }) => {
	if (!(await authApiKey(request, url))) return unauthorized();
	let body: { name?: string; steps?: unknown };
	try {
		body = (await request.json()) as { name?: string; steps?: unknown };
	} catch {
		return json({ error: 'request body must be JSON' }, 400);
	}
	if (!body.name || !body.steps) return json({ error: 'name and steps are required' }, 400);
	let dsl: string;
	try {
		dsl = JSON.stringify({ steps: parseTest({ steps: body.steps }).steps });
	} catch (e) {
		return json({ error: `invalid steps: ${e instanceof Error ? e.message : String(e)}` }, 400);
	}

	const existing = await db.query.project.findFirst();
	let projectId = existing?.id;
	if (!projectId) {
		const [org] = await db.insert(tables.org).values({ name: 'default' }).returning();
		const [project] = await db.insert(tables.project).values({ orgId: org.id, name: 'default' }).returning();
		projectId = project.id;
	}
	const [test] = await db.insert(tables.test).values({ projectId, name: body.name }).returning();
	const [version] = await db.insert(tables.testVersion).values({ testId: test.id, dsl }).returning();
	await db.update(tables.test).set({ currentVersionId: version.id }).where(eq(tables.test.id, test.id));
	return json({ id: test.id }, 201);
};
