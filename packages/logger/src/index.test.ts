import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './index';

const ORIGINAL_LOG_LEVEL = process.env.LOG_LEVEL;

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	if (ORIGINAL_LOG_LEVEL === undefined) delete process.env.LOG_LEVEL;
	else process.env.LOG_LEVEL = ORIGINAL_LOG_LEVEL;
	vi.restoreAllMocks();
});

/** The parsed JSON of the last console.log/error call. */
function lastLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
	const calls = spy.mock.calls;
	const last = calls[calls.length - 1];
	if (!last) throw new Error('expected a log line to have been written');
	return JSON.parse(last[0] as string);
}

describe('createLogger', () => {
	it('writes a JSON line with name, level, time, and fields + message', () => {
		delete process.env.LOG_LEVEL;
		const log = createLogger('svc');
		log.info({ runId: 'r1' }, 'started');

		const line = lastLine(vi.mocked(console.log));
		expect(line.name).toBe('svc');
		expect(line.level).toBe('info');
		expect(line.runId).toBe('r1');
		expect(line.msg).toBe('started');
		expect(typeof line.time).toBe('number');
	});

	it('supports a message-only call with no fields', () => {
		delete process.env.LOG_LEVEL;
		const log = createLogger('svc');
		log.info('just a message');

		const line = lastLine(vi.mocked(console.log));
		expect(line.msg).toBe('just a message');
	});

	it('omits msg when neither an object nor a string carries one', () => {
		delete process.env.LOG_LEVEL;
		const log = createLogger('svc');
		log.info({ only: 'fields' });

		const line = lastLine(vi.mocked(console.log));
		expect(line).not.toHaveProperty('msg');
		expect(line.only).toBe('fields');
	});

	it('routes error to console.error and others to console.log', () => {
		delete process.env.LOG_LEVEL;
		const log = createLogger('svc');
		log.error({ err: 'boom' }, 'failed');
		log.warn('careful');

		expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
		expect(lastLine(vi.mocked(console.error)).level).toBe('error');
		expect(lastLine(vi.mocked(console.log)).level).toBe('warn');
	});

	it('filters out levels below LOG_LEVEL', () => {
		process.env.LOG_LEVEL = 'warn';
		const log = createLogger('svc');
		log.debug('nope');
		log.info('nope');
		log.warn('yes');

		expect(vi.mocked(console.log)).toHaveBeenCalledTimes(1);
		expect(lastLine(vi.mocked(console.log)).msg).toBe('yes');
	});

	it('emits debug lines when LOG_LEVEL=debug', () => {
		process.env.LOG_LEVEL = 'debug';
		const log = createLogger('svc');
		log.debug({ detail: 1 }, 'trace');

		expect(lastLine(vi.mocked(console.log)).level).toBe('debug');
	});

	it('suppresses everything at LOG_LEVEL=silent', () => {
		process.env.LOG_LEVEL = 'silent';
		const log = createLogger('svc');
		log.error('should not appear');

		expect(vi.mocked(console.log)).not.toHaveBeenCalled();
		expect(vi.mocked(console.error)).not.toHaveBeenCalled();
	});

	it('falls back to info for an unrecognized LOG_LEVEL', () => {
		process.env.LOG_LEVEL = 'bogus';
		const log = createLogger('svc');
		log.debug('filtered');
		log.info('shown');

		expect(vi.mocked(console.log)).toHaveBeenCalledTimes(1);
		expect(lastLine(vi.mocked(console.log)).msg).toBe('shown');
	});
});
