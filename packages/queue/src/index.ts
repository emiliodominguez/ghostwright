import { Queue, QueueEvents, Worker, type ConnectionOptions, type Processor } from 'bullmq';

export const connection: ConnectionOptions = {
	host: process.env.REDIS_HOST ?? '127.0.0.1',
	port: Number(process.env.REDIS_PORT ?? 6379),
};

export const RUN_QUEUE = 'run';

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
		concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
	});
}

export { QueueEvents };
