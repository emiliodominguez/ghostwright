import { createLogger } from '@ghostwright/otel/logger';
import { reconcile } from './reconcile';

const log = createLogger('scheduler');
const INTERVAL_MS = Number(process.env.SCHEDULER_RECONCILE_MS ?? 30_000);

async function tick() {
	try {
		await reconcile();
	} catch (err) {
		log.error({ err: err instanceof Error ? err.message : String(err) }, 'reconcile failed');
	}
}

await tick();
setInterval(tick, INTERVAL_MS);
log.info({ intervalMs: INTERVAL_MS }, 'scheduler started');
