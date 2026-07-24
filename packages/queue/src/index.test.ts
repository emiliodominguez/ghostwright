import { describe, it, expect, vi, beforeEach } from 'vitest';

// The module under test instantiates a real ioredis client and a BullMQ Queue at import
// time, both of which would try to open sockets to Redis. Mock both so the tests are
// hermetic. `vi.hoisted` lets us build the mock objects before the (hoisted) `vi.mock`
// factories run, so the same references are shared between the module and the assertions.
const { mockLockRedis, QueueMock, WorkerMock, QueueEventsMock } = vi.hoisted(() => ({
	mockLockRedis: {
		set: vi.fn(),
		eval: vi.fn(),
	},
	QueueMock: vi.fn(),
	WorkerMock: vi.fn(),
	QueueEventsMock: vi.fn(),
}));

// IORedis is used as `new IORedis(...)`, so the default export must be constructable.
// A regular function that returns an object hands that object back from `new`.
vi.mock('ioredis', () => ({
	default: vi.fn(function IORedis() {
		return mockLockRedis;
	}),
}));

vi.mock('bullmq', () => ({
	Queue: QueueMock,
	Worker: WorkerMock,
	QueueEvents: QueueEventsMock,
}));

// Imported after the mocks are declared (vi.mock is hoisted above these anyway).
import { connection, RUN_QUEUE, withLock, runQueue, createRunWorker, QueueEvents } from './index';

const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

describe('RUN_QUEUE', () => {
	it('is the string "run"', () => {
		expect(RUN_QUEUE).toBe('run');
	});
});

describe('connection', () => {
	it('defaults to 127.0.0.1:6379 when no env is set', () => {
		expect(connection).toEqual({ host: '127.0.0.1', port: 6379 });
	});
});

describe('runQueue', () => {
	it('is constructed as a BullMQ Queue for RUN_QUEUE with the shared connection', () => {
		expect(runQueue).toBeInstanceOf(QueueMock);
		expect(QueueMock).toHaveBeenCalledWith(RUN_QUEUE, { connection });
	});
});

describe('QueueEvents', () => {
	it('re-exports the BullMQ QueueEvents class', () => {
		expect(QueueEvents).toBe(QueueEventsMock);
	});
});

describe('withLock', () => {
	beforeEach(() => {
		mockLockRedis.set.mockReset();
		mockLockRedis.eval.mockReset();
		mockLockRedis.eval.mockResolvedValue(1);
	});

	it('runs fn and returns its result when the lock is acquired, then releases it', async () => {
		mockLockRedis.set.mockResolvedValue('OK');

		const fn = vi.fn().mockResolvedValue('done');
		const result = await withLock('test-42', 30_000, fn);

		expect(result).toBe('done');
		expect(fn).toHaveBeenCalledTimes(1);

		expect(mockLockRedis.set).toHaveBeenCalledTimes(1);
		const setArgs = mockLockRedis.set.mock.calls[0];
		if (!setArgs) throw new Error('expected set to have been called');

		expect(setArgs[0]).toBe('gw:lock:test-42');
		expect(typeof setArgs[1]).toBe('string');
		expect(setArgs.slice(2)).toEqual(['PX', 30_000, 'NX']);

		// The finally block releases via a compare-and-delete Lua eval, passing the same
		// key and the token that was written by set.
		expect(mockLockRedis.eval).toHaveBeenCalledTimes(1);
		expect(mockLockRedis.eval).toHaveBeenCalledWith(RELEASE_SCRIPT, 1, 'gw:lock:test-42', setArgs[1]);
	});

	it('returns false without running fn or releasing when the lock is not acquired', async () => {
		mockLockRedis.set.mockResolvedValue(null);

		const fn = vi.fn();
		const result = await withLock('busy-key', 5_000, fn);

		expect(result).toBe(false);
		expect(fn).not.toHaveBeenCalled();
		expect(mockLockRedis.eval).not.toHaveBeenCalled();
	});

	it('still releases the lock when fn throws, and propagates the error', async () => {
		mockLockRedis.set.mockResolvedValue('OK');

		const boom = new Error('run failed');
		const fn = vi.fn().mockRejectedValue(boom);

		await expect(withLock('err-key', 1_000, fn)).rejects.toBe(boom);

		expect(mockLockRedis.eval).toHaveBeenCalledTimes(1);
		expect(mockLockRedis.eval).toHaveBeenCalledWith(RELEASE_SCRIPT, 1, 'gw:lock:err-key', expect.any(String));
	});

	it('swallows errors from the release eval', async () => {
		mockLockRedis.set.mockResolvedValue('OK');
		mockLockRedis.eval.mockRejectedValue(new Error('redis down'));

		const fn = vi.fn().mockResolvedValue('value');

		// The .catch(() => {}) on the eval means a failing release must not surface.
		await expect(withLock('flaky', 2_000, fn)).resolves.toBe('value');
		expect(mockLockRedis.eval).toHaveBeenCalledTimes(1);
	});
});

describe('createRunWorker', () => {
	beforeEach(() => {
		WorkerMock.mockClear();
		delete process.env.WORKER_CONCURRENCY;
	});

	it('constructs a Worker for RUN_QUEUE with the processor and default concurrency of 5', () => {
		const processor = vi.fn();
		const worker = createRunWorker(processor);

		expect(worker).toBeInstanceOf(WorkerMock);
		expect(WorkerMock).toHaveBeenCalledTimes(1);
		expect(WorkerMock).toHaveBeenCalledWith(RUN_QUEUE, processor, { connection, concurrency: 5 });
	});

	it('reads WORKER_CONCURRENCY from the environment at call time', () => {
		process.env.WORKER_CONCURRENCY = '12';

		const processor = vi.fn();
		createRunWorker(processor);

		expect(WorkerMock).toHaveBeenCalledWith(RUN_QUEUE, processor, { connection, concurrency: 12 });
	});
});
