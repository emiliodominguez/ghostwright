import { db, tables } from '@ghostwright/db';
import { connection, QueueEvents, RUN_QUEUE, runQueue } from '@ghostwright/queue';
import { eq } from 'drizzle-orm';

const demoUrl = process.env.DEMO_URL ?? 'https://example.com';

const demoDsl = {
	steps: [
		{ type: 'goto', url: demoUrl },
		{ type: 'assertVisible', locator: { role: 'heading', name: 'Example Domain' } },
		{ type: 'assertText', locator: { role: 'heading' }, text: 'Example Domain' },
		{ type: 'click', locator: { role: 'link', name: 'More information...' } },
		{ type: 'wait', timeoutMs: 500 },
	],
};

/** Assert an insert produced a row (a `.returning()` result should never be empty). */
function inserted<T>(rows: T[], what: string): T {
	const row = rows[0];
	if (row === undefined) throw new Error(`failed to insert ${what}`);

	return row;
}

async function main() {
	const org = inserted(await db.insert(tables.org).values({ name: 'demo-org' }).returning(), 'org');
	const project = inserted(await db.insert(tables.project).values({ orgId: org.id, name: 'demo-project' }).returning(), 'project');
	const test = inserted(await db.insert(tables.test).values({ projectId: project.id, name: 'example.com smoke' }).returning(), 'test');
	const tv = inserted(await db.insert(tables.testVersion).values({ testId: test.id, dsl: JSON.stringify(demoDsl) }).returning(), 'test version');

	const events = new QueueEvents(RUN_QUEUE, { connection });
	await events.waitUntilReady();

	const job = await runQueue.add('run', { testVersionId: tv.id, viewport: '1280x720' });
	console.log('enqueued job', job.id, 'for test_version', tv.id);

	const runId = await job.waitUntilFinished(events);
	const run = await db.query.run.findFirst({ where: eq(tables.run.id, runId) });
	const steps = await db.select().from(tables.stepResult).where(eq(tables.stepResult.runId, runId));

	console.log('\n=== RUN ===');
	console.log(JSON.stringify(run, null, 2));
	console.log('\n=== STEP RESULTS ===');
	for (const s of steps) console.log(`  [${s.idx}] ${s.type}: ${s.status} (${s.durationMs}ms)${s.error ? ': ' + s.error : ''}`);

	await events.close();
	await runQueue.close();
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
