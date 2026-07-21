import './telemetry';
import { createLogger } from '@ghostwright/otel/logger';
import { startWorker } from './queue';

const log = createLogger('worker');

const worker = startWorker();

worker.on('completed', (job, result) => log.info({ jobId: job.id, runId: result }, 'job completed'));
worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err.message }, 'job failed'));

log.info('worker started, waiting for jobs');
