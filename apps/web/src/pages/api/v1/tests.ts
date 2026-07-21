import { db, tables } from '@ghostwright/db';
import { desc } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { authApiKey, json, unauthorized } from '../../../server/api';

/** GET /api/v1/tests — list tests. */
export const GET: APIRoute = async ({ request, url }) => {
	if (!(await authApiKey(request, url))) return unauthorized();
	const tests = await db
		.select({ id: tables.test.id, name: tables.test.name, createdAt: tables.test.createdAt })
		.from(tables.test)
		.orderBy(desc(tables.test.createdAt));
	return json({ tests });
};
