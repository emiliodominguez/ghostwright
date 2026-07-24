import { Queue, QueueEvents, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import IORedis from 'ioredis';

export const connection: ConnectionOptions = {
	host: process.env.REDIS_HOST ?? '127.0.0.1',
	port: Number(process.env.REDIS_PORT ?? 6379),
};

export const RUN_QUEUE = 'run';

// A dedicated Redis client for the per-test lock (BullMQ owns its own connections).
const lockRedis = new IORedis({
	host: process.env.REDIS_HOST ?? '127.0.0.1',
	port: Number(process.env.REDIS_PORT ?? 6379),
	maxRetriesPerRequest: null,
});

/**
 * Run `fn` while holding an exclusive per-key lock, so two jobs for the same key
 * (e.g. the browser runs of one test) never execute at once — even within the global
 * concurrency budget. Returns `false` without running `fn` if the lock is currently
 * held by another job; the caller should defer and retry. The lock auto-expires after
 * `ttlMs` so a crashed worker can never deadlock the key.
 *
 * @param key - the lock identity (a test id).
 * @param ttlMs - lock lease length; must exceed the longest run.
 * @param fn - the work to run while holding the lock.
 * @returns the result of `fn`, or `false` if the lock could not be acquired.
 */
export async function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | false> {
	const lockKey = `gw:lock:${key}`;
	const token = `${process.pid}-${Math.floor(performance.now())}`;
	const acquired = await lockRedis.set(lockKey, token, 'PX', ttlMs, 'NX');
	if (!acquired) return false;

	try {
		return await fn();
	} finally {
		// Release only if we still own it (compare-and-delete), so we never delete a
		// lock that already expired and was re-acquired by another job.
		const release = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
		await lockRedis.eval(release, 1, lockKey, token).catch(() => {});
	}
}

export interface RunJob {
	/** Pre-created run row to update; if absent the worker creates one. */
	runId?: string;
	/** Explicit version to run. */
	testVersionId?: string;
	/** Or a test id — the worker resolves its current version (used by schedules). */
	testId?: string;
	/** Inject this login flow's captured session and re-auth on login redirect. */
	loginFlowId?: string;
	/** If set, this job captures the given login flow's storageState instead of running a test. */
	captureLoginState?: string;
	viewport?: string;
	baseUrl?: string;
	/** Browser engine to run on: chromium | firefox | webkit (default chromium). */
	browser?: string;
	/** Seed variables for this run (one data-driven row → one job). */
	vars?: Record<string, string>;
}

/** Shared producer handle — used by the API/scheduler to enqueue runs. */
export const runQueue = new Queue<RunJob>(RUN_QUEUE, { connection });

/**
 * Create a worker that consumes run jobs.
 *
 * @param processor - handler that executes a run and returns its id.
 * @returns the running Worker.
 */
export function createRunWorker(processor: Processor<RunJob, string>): Worker<RunJob, string> {
	return new Worker<RunJob, string>(RUN_QUEUE, processor, {
		connection,
		// Global cap on runs executing at once, across all tests (configurable).
		concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
	});
}

export { QueueEvents };
