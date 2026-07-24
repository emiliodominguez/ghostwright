import { describe, expect, it } from 'vitest';
import { parseSettings, testSettingsSchema } from './index';

describe('test settings', () => {
	it('parses a full settings object', () => {
		const s = testSettingsSchema.parse({
			viewport: '390x844',
			userAgent: 'MyBot/1.0',
			language: 'fr-FR',
			basicAuth: { username: 'u', password: 'p' },
			elementTimeoutMs: 20000,
			stepDelayMs: 250,
			failOnJsError: true,
			retry: true,
		});
		expect(s.userAgent).toBe('MyBot/1.0');
		expect(s.basicAuth?.username).toBe('u');
	});

	it('parseSettings tolerates null/empty', () => {
		expect(parseSettings(null)).toEqual({});
		expect(parseSettings('')).toEqual({});
		expect(parseSettings('{"retry":true}')).toEqual({ retry: true });
	});
});
