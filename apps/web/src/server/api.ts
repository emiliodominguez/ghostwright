import { db, tables } from '@ghostwright/db';
import { runQueue, type RunJob } from '@ghostwright/queue';
import { eq } from 'drizzle-orm';

/**
 * Authenticate a REST request by API key (`?apiKey=` or `Authorization: Bearer`).
 *
 * @param request - the incoming request.
 * @param url - the parsed request URL.
 * @returns true when the key is valid.
 */
export async function authApiKey(request: Request, url: URL): Promise<boolean> {
	const key = url.searchParams.get('apiKey') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (!key) return false;
	const row = await db.query.apiKey.findFirst({ where: eq(tables.apiKey.key, key) });
	return Boolean(row);
}

/** 401 JSON response for unauthenticated REST calls. */
export function unauthorized(): Response {
	return json({ error: 'invalid or missing apiKey' }, 401);
}

/** JSON Response helper. */
export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A run result serialized for the REST API. */
export async function resultJson(runId: string) {
	const run = await db.query.run.findFirst({ where: eq(tables.run.id, runId) });
	if (!run) return null;
	const steps = await db.select().from(tables.stepResult).where(eq(tables.stepResult.runId, runId)).orderBy(tables.stepResult.idx);
	return {
		id: run.id,
		passing: run.status === 'passed',
		status: run.status,
		error: run.error,
		startedAt: run.startedAt,
		finishedAt: run.finishedAt,
		steps: steps.map((s) => ({ idx: s.idx, type: s.type, status: s.status, durationMs: s.durationMs, error: s.error })),
	};
}

/** Enqueue a run for a test's current version; returns the created run id. */
export async function enqueueRun(testId: string): Promise<string | null> {
	const test = await db.query.test.findFirst({ where: eq(tables.test.id, testId) });
	if (!test?.currentVersionId) return null;
	const [run] = await db.insert(tables.run).values({ testVersionId: test.currentVersionId, status: 'queued', viewport: '1280x720' }).returning();
	const job: RunJob = { runId: run.id, testVersionId: test.currentVersionId, viewport: '1280x720' };
	await runQueue.add('run', job);
	return run.id;
}

/** Poll until a run reaches a terminal status, or the timeout elapses. */
export async function waitForRun(runId: string, timeoutMs = 60000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const run = await db.query.run.findFirst({ where: eq(tables.run.id, runId) });
		if (run && ['passed', 'failed', 'errored'].includes(run.status)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
}
