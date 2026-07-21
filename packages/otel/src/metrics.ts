import { metrics, trace, type Counter, type Histogram, type Span, type Tracer } from '@opentelemetry/api';

// Instruments are created lazily, on first use — by then startTelemetry() has
// registered the real provider. Creating them at module load would bind to a
// no-op meter (module loads before the SDK starts) and nothing would export.
let _tracer: Tracer | undefined;
let _runs: Counter | undefined;
let _stepDur: Histogram | undefined;

function tracer(): Tracer {
	return (_tracer ??= trace.getTracer('ghostwright'));
}
function runsTotal(): Counter {
	return (_runs ??= metrics.getMeter('ghostwright').createCounter('ghostwright_runs_total', { description: 'Runs finished, by status' }));
}
function stepDuration(): Histogram {
	return (_stepDur ??= metrics.getMeter('ghostwright').createHistogram('ghostwright_step_duration_ms', { description: 'Per-step duration in ms' }));
}

/**
 * Run a function inside a span named `run`, tagged with the run id.
 *
 * @param runId - the run this span represents.
 * @param fn - receives the active span.
 */
export async function withRunSpan<T>(runId: string, fn: (span: Span) => Promise<T>): Promise<T> {
	return tracer().startActiveSpan('run', async (span) => {
		span.setAttribute('gw.run.id', runId);
		try {
			return await fn(span);
		} finally {
			span.end();
		}
	});
}

/**
 * Run a step inside a child span (one span per step) and record its duration metric.
 *
 * @param ctx - run id, step index, and step type for correlation/labels.
 * @param fn - the step execution.
 */
export async function withStepSpan<T>(ctx: { runId: string; idx: number; type: string }, fn: () => Promise<T>): Promise<T> {
	const start = Date.now();
	return tracer().startActiveSpan(`step:${ctx.type}`, async (span) => {
		span.setAttributes({ 'gw.run.id': ctx.runId, 'gw.step.idx': ctx.idx, 'gw.step.type': ctx.type });
		let status = 'passed';
		try {
			return await fn();
		} catch (err) {
			status = 'failed';
			span.recordException(err as Error);
			throw err;
		} finally {
			stepDuration().record(Date.now() - start, { type: ctx.type, status });
			span.setAttribute('gw.step.status', status);
			span.end();
		}
	});
}

/** Record a finished run in the runs-total counter. */
export function recordRun(status: string): void {
	runsTotal().add(1, { status });
}
