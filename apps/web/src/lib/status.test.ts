import { describe, it, expect } from 'vitest';

import { runStatus, stepStatus, stripAnsi, type Tone } from './status';

describe('runStatus', () => {
	const cases: Array<[string, { label: string; tone: Tone }]> = [
		['passed', { label: 'Passed', tone: 'success' }],
		['failed', { label: 'Failed', tone: 'danger' }],
		['errored', { label: 'Something went wrong', tone: 'warning' }],
		['running', { label: 'Running…', tone: 'running' }],
		['queued', { label: 'Waiting to start', tone: 'neutral' }],
	];

	it.each(cases)('maps %s to the expected label + tone', (input, expected) => {
		expect(runStatus(input)).toEqual(expected);
	});

	it('falls back to the raw input with a neutral tone for unknown keys', () => {
		expect(runStatus('mystery')).toEqual({ label: 'mystery', tone: 'neutral' });
	});

	it('falls back for an empty string', () => {
		expect(runStatus('')).toEqual({ label: '', tone: 'neutral' });
	});
});

describe('stepStatus', () => {
	const cases: Array<[string, { label: string; tone: Tone }]> = [
		['passed', { label: 'Passed', tone: 'success' }],
		['failed', { label: 'Failed', tone: 'danger' }],
		['skipped', { label: 'Skipped', tone: 'neutral' }],
	];

	it.each(cases)('maps %s to the expected label + tone', (input, expected) => {
		expect(stepStatus(input)).toEqual(expected);
	});

	it('falls back to the raw input with a neutral tone for unknown keys', () => {
		expect(stepStatus('flaky')).toEqual({ label: 'flaky', tone: 'neutral' });
	});
});

describe('stripAnsi', () => {
	it('strips a simple ANSI-wrapped string', () => {
		expect(stripAnsi('\x1b[2mfoo\x1b[0m')).toBe('foo');
	});

	it('returns undefined for undefined input', () => {
		expect(stripAnsi(undefined)).toBeUndefined();
	});

	it('leaves a clean string unchanged', () => {
		expect(stripAnsi('hello world')).toBe('hello world');
	});

	it('leaves an empty string unchanged', () => {
		expect(stripAnsi('')).toBe('');
	});

	it('strips multiple codes across a string', () => {
		expect(stripAnsi('\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m')).toBe('red and green');
	});

	it('strips codes with multiple numeric parameters', () => {
		expect(stripAnsi('\x1b[1;33;40mwarn\x1b[0m')).toBe('warn');
	});
});
