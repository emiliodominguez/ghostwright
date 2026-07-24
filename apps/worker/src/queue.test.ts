import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared refs, hoisted so they exist before the vi.mock factories run.
const h = vi.hoisted(() => {
	return {
		capturedProcessor: undefined as
			| ((job: { data: unknown }) => Promise<unknown>)
			| undefined,
		fakeWorker: { id: 'fake-worker' },
		createRunWorker: vi.fn(),
		runQueueAdd: vi.fn(),
		withLock: vi.fn(),
		findFirst: vi.fn(),
		executeRun: vi.fn(),
		captureLoginState: vi.fn(),
		parseTest: vi.fn(),
		eq: vi.fn(),
	};
});

vi.mock('@ghostwright/queue', () => ({
	createRunWorker: h.createRunWorker,
	runQueue: { add: h.runQueueAdd },
	withLock: h.withLock,
}));

vi.mock('@ghostwright/db', () => ({
	db: { query: { testVersion: { findFirst: h.findFirst } } },
	tables: { testVersion: { id: 'id' } },
}));

vi.mock('@ghostwright/dsl', () => ({
	parseTest: h.parseTest,
}));

vi.mock('./run', () => ({
	executeRun: h.executeRun,
}));

vi.mock('./login', () => ({
	captureLoginState: h.captureLoginState,
}));

vi.mock('@ghostwright/logger', () => ({
	createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('drizzle-orm', () => ({
	eq: h.eq,
}));

import { startWorker } from './queue';

// A sentinel the parseTest mock throws on, to exercise the malformed-DSL catch branch.
const MALFORMED = '__throw__';

beforeEach(() => {
	vi.clearAllMocks();

	h.capturedProcessor = undefined;

	// createRunWorker captures the processor and returns a fake worker.
	h.createRunWorker.mockImplementation((processor) => {
		h.capturedProcessor = processor;
		return h.fakeWorker;
	});

	// eq returns an opaque object; queue.ts only forwards it to findFirst.
	h.eq.mockImplementation((a, b) => ({ a, b }));

	// parseTest returns its input as-is (throwing on the sentinel).
	h.parseTest.mockImplementation((x) => {
		if (x === MALFORMED) throw new Error('malformed');

		return x;
	});

	// withLock: acquire the lock and run the fn by default.
	h.withLock.mockImplementation(async (_key, _ttl, fn) => fn());

	h.executeRun.mockResolvedValue('run-result');
	h.captureLoginState.mockResolvedValue('capture-result');
});

/** Invoke startWorker, then return the processor it registered with createRunWorker. */
function getProcessor(): (job: { data: unknown }) => Promise<unknown> {
	startWorker();

	const processor = h.capturedProcessor;
	if (processor === undefined) throw new Error('processor was not captured');

	return processor;
}

/** The arguments a mock was first called with, asserting it was called at least once. */
function firstCall(mock: ReturnType<typeof vi.fn>): unknown[] {
	const args = mock.mock.calls[0];
	if (args === undefined) throw new Error('expected the mock to have been called');

	return args;
}

describe('startWorker', () => {
	it('returns the worker from createRunWorker', () => {
		const worker = startWorker();

		expect(worker).toBe(h.fakeWorker);
		expect(h.createRunWorker).toHaveBeenCalledTimes(1);
	});

	it('case 1: capture-login job runs captureLoginState and skips lock/executeRun', async () => {
		const processor = getProcessor();

		const result = await processor({ data: { captureLoginState: 'login-id-42' } });

		expect(result).toBe('capture-result');
		expect(h.captureLoginState).toHaveBeenCalledWith('login-id-42');
		expect(h.withLock).not.toHaveBeenCalled();
		expect(h.executeRun).not.toHaveBeenCalled();
	});

	it('case 2: baseUrl host becomes the lock key and executeRun runs under it', async () => {
		const processor = getProcessor();

		const job = { runId: 'r1', baseUrl: 'http://localhost:3130/x', testId: 't1' };
		const result = await processor({ data: job });

		expect(h.withLock).toHaveBeenCalledTimes(1);
		expect(firstCall(h.withLock)[0]).toBe('app:localhost:3130');
		expect(h.executeRun).toHaveBeenCalledWith(job);
		expect(result).toBe('run-result');
		// baseUrl short-circuits, so the DB is never consulted.
		expect(h.findFirst).not.toHaveBeenCalled();
	});

	it('case 3: no baseUrl, first goto step host from the test version DSL is the key', async () => {
		h.findFirst.mockResolvedValue({
			dsl: JSON.stringify({ steps: [{ type: 'goto', url: 'http://example.com:8080/a' }] }),
		});

		const processor = getProcessor();

		const job = { runId: 'r2', testVersionId: 'tv2', testId: 't2' };
		const result = await processor({ data: job });

		expect(h.findFirst).toHaveBeenCalledTimes(1);
		expect(firstCall(h.withLock)[0]).toBe('app:example.com:8080');
		expect(h.executeRun).toHaveBeenCalledWith(job);
		expect(result).toBe('run-result');
	});

	it('case 4: no goto step in DSL falls back to testVersionId as the key', async () => {
		h.findFirst.mockResolvedValue({
			dsl: JSON.stringify({ steps: [{ type: 'wait' }] }),
		});

		const processor = getProcessor();

		const job = { runId: 'r3', testVersionId: 'tv3', testId: 't3' };
		await processor({ data: job });

		expect(firstCall(h.withLock)[0]).toBe('tv3');
	});

	it('case 5: findFirst returns undefined falls back to testVersionId as the key', async () => {
		h.findFirst.mockResolvedValue(undefined);

		const processor = getProcessor();

		const job = { runId: 'r4', testVersionId: 'tv4', testId: 't4' };
		await processor({ data: job });

		expect(h.findFirst).toHaveBeenCalledTimes(1);
		expect(firstCall(h.withLock)[0]).toBe('tv4');
	});

	it('case 6: no baseUrl and no testVersionId falls back to testId as the key', async () => {
		const processor = getProcessor();

		const job = { runId: 'r5', testId: 't5' };
		await processor({ data: job });

		// No versionId means targetAppKey returns null without touching the DB.
		expect(h.findFirst).not.toHaveBeenCalled();
		expect(firstCall(h.withLock)[0]).toBe('t5');
	});

	it('case 7: invalid baseUrl and no version/goto falls back to testId', async () => {
		const processor = getProcessor();

		const job = { runId: 'r6', baseUrl: 'not a url', testId: 't6' };
		await processor({ data: job });

		// hostOf returns null for the bad URL; no versionId, so we fall through to testId.
		expect(h.findFirst).not.toHaveBeenCalled();
		expect(firstCall(h.withLock)[0]).toBe('t6');
	});

	it('case 7b: no lock key at all runs executeRun directly without withLock', async () => {
		const processor = getProcessor();

		const job = { runId: 'r7', baseUrl: 'not a url' };
		const result = await processor({ data: job });

		expect(h.withLock).not.toHaveBeenCalled();
		expect(h.executeRun).toHaveBeenCalledWith(job);
		expect(result).toBe('run-result');
	});

	it('case 8: busy lock defers the job and re-queues with a delay', async () => {
		h.withLock.mockImplementation(async () => false);

		const processor = getProcessor();

		const job = { runId: 'r8', baseUrl: 'http://localhost:3130/x', testId: 't8', browser: 'chromium' };
		const result = await processor({ data: job });

		expect(result).toBe('deferred');
		expect(h.runQueueAdd).toHaveBeenCalledTimes(1);

		const [name, data, opts] = firstCall(h.runQueueAdd);
		expect(name).toBe('run');
		expect(data).toBe(job);
		const delay = (opts as { delay?: number }).delay;
		expect(typeof delay).toBe('number');
		expect(delay).toBeGreaterThan(0);

		// The processor did not itself run executeRun (withLock never invoked its fn).
		expect(h.executeRun).not.toHaveBeenCalled();
	});

	it('case 4b: goto step with an unparseable URL is skipped, falling back to testVersionId', async () => {
		// The goto exists but its URL has no host, so hostOf returns null and the loop
		// moves on — exercising the falsy branch of `if (host)` inside the goto scan.
		h.findFirst.mockResolvedValue({
			dsl: JSON.stringify({ steps: [{ type: 'goto', url: 'not a url' }] }),
		});

		const processor = getProcessor();

		const job = { runId: 'r4b', testVersionId: 'tv4b', testId: 't4b' };
		await processor({ data: job });

		expect(firstCall(h.withLock)[0]).toBe('tv4b');
	});

	it('case 9: malformed DSL is swallowed and falls back to testVersionId', async () => {
		// dsl is the sentinel string; JSON.parse('"__throw__"') yields the sentinel,
		// which makes the parseTest mock throw, exercising the catch branch.
		h.findFirst.mockResolvedValue({ dsl: JSON.stringify(MALFORMED) });

		const processor = getProcessor();

		const job = { runId: 'r9', testVersionId: 'tv9', testId: 't9' };
		await processor({ data: job });

		expect(h.parseTest).toHaveBeenCalledTimes(1);
		expect(firstCall(h.withLock)[0]).toBe('tv9');
	});
});
