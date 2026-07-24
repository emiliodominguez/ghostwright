import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared mock refs so the module factories can reference them (they are hoisted above imports).
const h = vi.hoisted(() => ({
	apiKeyFind: vi.fn(),
	runFind: vi.fn(),
	testFind: vi.fn(),
	stepRows: [] as unknown[],
	insertReturn: [{ id: 'run-1' }] as unknown[],
	queueAdd: vi.fn(),
	select: vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: () => h.stepRows }) }) })),
	insert: vi.fn(() => ({ values: () => ({ returning: async () => h.insertReturn }) })),
}));

vi.mock('@ghostwright/db', () => ({
	db: {
		query: {
			apiKey: { findFirst: h.apiKeyFind },
			run: { findFirst: h.runFind },
			test: { findFirst: h.testFind },
		},
		select: h.select,
		insert: h.insert,
	},
	tables: {
		apiKey: { key: 'key' },
		run: { id: 'id' },
		stepResult: { runId: 'runId', idx: 'idx' },
		test: { id: 'id' },
	},
}));

vi.mock('@ghostwright/queue', () => ({ runQueue: { add: h.queueAdd } }));

vi.mock('drizzle-orm', () => ({ eq: vi.fn((a, b) => ({ a, b })) }));

// NOTE: '../lib/status' is intentionally NOT mocked — stripAnsi is pure and real.

import { authApiKey, unauthorized, json, resultJson, enqueueRun, waitForRun } from './api';

beforeEach(() => {
	vi.clearAllMocks();

	h.stepRows = [];
	h.insertReturn = [{ id: 'run-1' }];
	h.apiKeyFind.mockResolvedValue(undefined);
	h.runFind.mockResolvedValue(undefined);
	h.testFind.mockResolvedValue(undefined);
	h.queueAdd.mockResolvedValue(undefined);
});

describe('json', () => {
	it('returns a JSON Response with the default 200 status and content-type', async () => {
		const res = json({ hello: 'world' });

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual({ hello: 'world' });
	});

	it('honors an explicit status code', async () => {
		const res = json({ ok: false }, 500);

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ ok: false });
	});
});

describe('unauthorized', () => {
	it('returns a 401 with the invalid/missing apiKey error body', async () => {
		const res = unauthorized();

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'invalid or missing apiKey' });
	});
});

describe('authApiKey', () => {
	it('reads the key from the ?apiKey= query param and returns true when a row exists', async () => {
		h.apiKeyFind.mockResolvedValue({ id: 'k1' });

		const request = new Request('http://x/?apiKey=k');
		const url = new URL(request.url);

		const result = await authApiKey(request, url);

		expect(result).toBe(true);
		expect(h.apiKeyFind).toHaveBeenCalledTimes(1);
	});

	it('falls through to the Authorization Bearer header when ?apiKey= is empty', async () => {
		h.apiKeyFind.mockResolvedValue({ id: 'k1' });

		const request = new Request('http://x/', { headers: { authorization: 'Bearer XYZ' } });
		const url = new URL('http://x/');

		const result = await authApiKey(request, url);

		expect(result).toBe(true);
		expect(h.apiKeyFind).toHaveBeenCalledTimes(1);

		const arg = h.apiKeyFind.mock.calls[0][0];

		// eq(tables.apiKey.key, key) → mocked eq returns { a, b }; b is the stripped key.
		expect(arg.where.b).toBe('XYZ');
	});

	it('returns false without touching the db when no key is present anywhere', async () => {
		const request = new Request('http://x/');
		const url = new URL('http://x/');

		const result = await authApiKey(request, url);

		expect(result).toBe(false);
		expect(h.apiKeyFind).not.toHaveBeenCalled();
	});

	it('returns false when a key is present but no matching row is found', async () => {
		h.apiKeyFind.mockResolvedValue(undefined);

		const request = new Request('http://x/?apiKey=k');
		const url = new URL(request.url);

		const result = await authApiKey(request, url);

		expect(result).toBe(false);
		expect(h.apiKeyFind).toHaveBeenCalledTimes(1);
	});
});

describe('resultJson', () => {
	it('returns null when the run does not exist', async () => {
		h.runFind.mockResolvedValue(undefined);

		expect(await resultJson('missing')).toBeNull();
	});

	it('serializes a passing run with its steps and strips ANSI from step errors', async () => {
		h.runFind.mockResolvedValue({
			id: 'run-1',
			status: 'passed',
			error: null,
			startedAt: 'S',
			finishedAt: 'F',
		});
		h.stepRows = [
			{ idx: 0, type: 'goto', status: 'passed', durationMs: 10, diffPct: 0, error: null },
			{ idx: 1, type: 'click', status: 'passed', durationMs: 20, diffPct: 0, error: '\x1b[2mboom\x1b[0m' },
		];

		const out = await resultJson('run-1');

		expect(out).not.toBeNull();
		expect(out?.passing).toBe(true);
		expect(out?.screenshotFailing).toBe(false);
		expect(out?.screenshotPassing).toBe(true);
		expect(out?.status).toBe('passed');
		expect(out?.error).toBeUndefined();
		expect(out?.startedAt).toBe('S');
		expect(out?.finishedAt).toBe('F');
		expect(out?.steps).toEqual([
			{ idx: 0, type: 'goto', status: 'passed', durationMs: 10, diffPct: 0, error: undefined },
			{ idx: 1, type: 'click', status: 'passed', durationMs: 20, diffPct: 0, error: 'boom' },
		]);
	});

	it('flags screenshotFailing for a failed run whose error matches /visual regression/i', async () => {
		h.runFind.mockResolvedValue({
			id: 'run-2',
			status: 'failed',
			error: 'Visual Regression detected on step 3',
			startedAt: null,
			finishedAt: null,
		});
		h.stepRows = [];

		const out = await resultJson('run-2');

		expect(out?.passing).toBe(false);
		expect(out?.screenshotFailing).toBe(true);
		expect(out?.screenshotPassing).toBe(false);
	});

	it('does not flag screenshotFailing for a failed run with a non-visual error, and strips ANSI from run.error', async () => {
		h.runFind.mockResolvedValue({
			id: 'run-3',
			status: 'failed',
			error: '\x1b[2msomething else broke\x1b[0m',
			startedAt: null,
			finishedAt: null,
		});
		h.stepRows = [];

		const out = await resultJson('run-3');

		expect(out?.passing).toBe(false);
		expect(out?.screenshotFailing).toBe(false);
		expect(out?.screenshotPassing).toBe(true);
		expect(out?.error).toBe('something else broke');
	});

	it('handles a failed run with a null error (the ?? fallback)', async () => {
		h.runFind.mockResolvedValue({ id: 'run-4', status: 'failed', error: null, startedAt: null, finishedAt: null });
		h.stepRows = [];

		const out = await resultJson('run-4');

		expect(out?.screenshotFailing).toBe(false);
		expect(out?.error).toBeUndefined();
	});
});

describe('enqueueRun', () => {
	it('inserts a run and enqueues a job for a test with a currentVersionId', async () => {
		h.testFind.mockResolvedValue({ id: 't1', currentVersionId: 'v1' });
		h.insertReturn = [{ id: 'run-1' }];

		const runId = await enqueueRun('t1');

		expect(runId).toBe('run-1');
		expect(h.insert).toHaveBeenCalledTimes(1);
		expect(h.queueAdd).toHaveBeenCalledTimes(1);
		expect(h.queueAdd).toHaveBeenCalledWith('run', {
			runId: 'run-1',
			testVersionId: 'v1',
			viewport: '1280x720',
		});
	});

	it('returns null without inserting or enqueuing when the test does not exist', async () => {
		h.testFind.mockResolvedValue(undefined);

		const runId = await enqueueRun('missing');

		expect(runId).toBeNull();
		expect(h.insert).not.toHaveBeenCalled();
		expect(h.queueAdd).not.toHaveBeenCalled();
	});

	it('returns null without inserting or enqueuing when the test has no currentVersionId', async () => {
		h.testFind.mockResolvedValue({ id: 't2', currentVersionId: null });

		const runId = await enqueueRun('t2');

		expect(runId).toBeNull();
		expect(h.insert).not.toHaveBeenCalled();
		expect(h.queueAdd).not.toHaveBeenCalled();
	});
});

describe('waitForRun', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves promptly when the run is already terminal on the first poll', async () => {
		h.runFind.mockResolvedValue({ id: 'r', status: 'passed' });

		await expect(waitForRun('r')).resolves.toBeUndefined();
		expect(h.runFind).toHaveBeenCalledTimes(1);
	});

	it('keeps polling while non-terminal and resolves once the run becomes terminal', async () => {
		h.runFind
			.mockResolvedValueOnce({ id: 'r', status: 'running' })
			.mockResolvedValueOnce({ id: 'r', status: 'passed' });

		const promise = waitForRun('r');

		// First poll saw 'running'; let the 500ms setTimeout fire so the loop polls again.
		await vi.advanceTimersByTimeAsync(500);

		await expect(promise).resolves.toBeUndefined();
		expect(h.runFind).toHaveBeenCalledTimes(2);
	});

	it('resolves without throwing once the deadline passes while the run stays non-terminal', async () => {
		h.runFind.mockResolvedValue({ id: 'r', status: 'running' });

		const promise = waitForRun('r', 1000);

		// Advance well past the 1000ms deadline in 500ms steps so each setTimeout fires and
		// Date.now() eventually exceeds the deadline, ending the loop.
		await vi.advanceTimersByTimeAsync(500);
		await vi.advanceTimersByTimeAsync(500);
		await vi.advanceTimersByTimeAsync(500);

		await expect(promise).resolves.toBeUndefined();
	});
});
