import { createRunWorker } from '@ghostwright/queue';
import { Worker } from 'bullmq';
import { captureLoginState } from './login';
import { executeRun } from './run';
import type { RunJob } from '@ghostwright/queue';

/**
 * Start a BullMQ worker that executes queued runs (or captures login state).
 *
 * @returns the running Worker (attach lifecycle listeners on it).
 */
export function startWorker(): Worker<RunJob, string> {
	return createRunWorker(async (job) => (job.data.captureLoginState ? captureLoginState(job.data.captureLoginState) : executeRun(job.data)));
}
