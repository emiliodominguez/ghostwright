import { db, tables } from '@ghostwright/db';
import { runQueue } from '@ghostwright/queue';
import { createLogger } from '@ghostwright/otel/logger';
import { eq } from 'drizzle-orm';

const log = createLogger('scheduler');

/** BullMQ job-scheduler id for a Schedule row. */
function schedulerId(scheduleId: string): string {
	return `schedule:${scheduleId}`;
}

/**
 * Sync BullMQ Job Schedulers with the Schedule table: upsert one per enabled row,
 * remove any scheduler whose row is gone or disabled. Idempotent — safe to run on a loop.
 *
 * @returns counts of active and removed schedulers.
 */
export async function reconcile(): Promise<{ active: number; removed: number }> {
	const schedules = await db.select().from(tables.schedule).where(eq(tables.schedule.enabled, true));
	const wanted = new Map(schedules.map((s) => [schedulerId(s.id), s]));

	for (const [id, s] of wanted) {
		await runQueue.upsertJobScheduler(id, { pattern: s.cron, tz: s.tz }, { name: 'run', data: { testId: s.testId } });
	}

	// Drop schedulers no longer wanted (deleted or disabled rows).
	const existing = await runQueue.getJobSchedulers(0, 1000);
	let removed = 0;
	for (const js of existing) {
		if (js.key.startsWith('schedule:') && !wanted.has(js.key)) {
			await runQueue.removeJobScheduler(js.key);
			removed++;
		}
	}

	log.info({ active: wanted.size, removed }, 'reconciled schedulers');
	return { active: wanted.size, removed };
}
