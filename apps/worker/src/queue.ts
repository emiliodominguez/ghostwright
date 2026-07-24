import { db, tables } from '@ghostwright/db';
import { parseTest } from '@ghostwright/dsl';
import { createRunWorker, runQueue, withLock } from '@ghostwright/queue';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createLogger } from '@ghostwright/logger';
import { captureLoginState } from './login';
import { executeRun } from './run';
import type { RunJob } from '@ghostwright/queue';

const log = createLogger('worker.queue');

// A run's lock lease. Must comfortably exceed the longest run (a slow login flow plus
// step retries), or the lock could expire mid-run and let a second run start against
// the same app.
const TEST_LOCK_TTL_MS = 10 * 60 * 1000;
// How long a job waits before retrying when the app it targets is already busy.
// Small enough to feel responsive, large enough not to spin Redis.
const DEFER_DELAY_MS = 3000;

/**
 * The app a run targets, as a lock key, so tests hitting the SAME application are
 * serialized (they share server-side state and would otherwise clobber each other),
 * while tests against DIFFERENT apps still run in parallel. The target is the host
 * (host:port) of the run's baseUrl, or — when there's no baseUrl — the first `goto`
 * step's absolute URL in the test's DSL. Falls back to per-test serialization only
 * when no target host can be determined.
 *
 * @param job - the run job to resolve a target for.
 * @returns a `app:<host>` lock key, or null if the target app can't be determined.
 */
async function targetAppKey(job: RunJob): Promise<string | null> {
	const hostOf = (url: string): string | null => {
		try {
			return new URL(url).host;
		} catch {
			return null;
		}
	};

	if (job.baseUrl) {
		const host = hostOf(job.baseUrl);
		if (host) return `app:${host}`;
	}

	// No baseUrl: look at the test's steps for the first absolute navigation target.
	const versionId = job.testVersionId;
	if (!versionId) return null;

	const tv = await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, versionId) });
	if (!tv) return null;

	try {
		const { steps } = parseTest(JSON.parse(tv.dsl));
		for (const step of steps) {
			if (step.type === 'goto') {
				const host = hostOf(step.url);
				if (host) return `app:${host}`;
			}
		}
	} catch {
		/* malformed DSL — fall through to the per-test fallback */
	}

	return null;
}

/**
 * Start a BullMQ worker that executes queued runs (or captures login state).
 *
 * Runs are globally capped by WORKER_CONCURRENCY (see createRunWorker), and
 * additionally serialized per target application: a run holds a lock keyed to the app
 * it tests (its baseUrl/goto host) while executing, so any two runs that hit the same
 * app — different tests included — never overlap and clobber each other's server-side
 * state, while runs against different apps still run in parallel. When the lock is
 * busy, the job re-queues itself after a short delay, freeing its concurrency slot for
 * a run against a different app rather than blocking.
 *
 * @returns the running Worker (attach lifecycle listeners on it).
 */
export function startWorker(): Worker<RunJob, string> {
	return createRunWorker(async (job) => {
		// Captures aren't test runs; they don't contend for a test's app state.
		if (job.data.captureLoginState) return captureLoginState(job.data.captureLoginState);

		// Serialize by the app under test; fall back to the test's own identity when the
		// target host can't be determined (so we still never overlap a test with itself).
		const lockKey = (await targetAppKey(job.data)) ?? job.data.testVersionId ?? job.data.testId;
		if (!lockKey) return executeRun(job.data);

		const result = await withLock(lockKey, TEST_LOCK_TTL_MS, () => executeRun(job.data));
		if (result !== false) return result;

		// Lock held by another run against the same app — defer and let the slot serve
		// a run targeting a different app.
		log.info({ runId: job.data.runId, lockKey, browser: job.data.browser }, 'target app busy, deferring run');
		await runQueue.add('run', job.data, { delay: DEFER_DELAY_MS });
		return 'deferred';
	});
}
