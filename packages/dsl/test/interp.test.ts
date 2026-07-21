import { describe, expect, it } from 'vitest';
import { interpolate } from '../src/index';

describe('interpolate', () => {
	const vars: Record<string, string> = { name: 'Ada', 'user.email': 'ada@x.test' };
	const lookup = (k: string) => vars[k];

	it('replaces known tokens', () => {
		expect(interpolate('Hi {{name}}', lookup)).toBe('Hi Ada');
		expect(interpolate('mail {{ user.email }}', lookup)).toBe('mail ada@x.test');
	});

	it('leaves unknown tokens verbatim', () => {
		expect(interpolate('{{missing}} here', lookup)).toBe('{{missing}} here');
	});

	it('handles multiple tokens and no tokens', () => {
		expect(interpolate('{{name}}<{{user.email}}>', lookup)).toBe('Ada<ada@x.test>');
		expect(interpolate('plain', lookup)).toBe('plain');
	});
});
