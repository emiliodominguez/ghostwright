import { describe, expect, it } from 'vitest';
import { describeStep, parseTest } from '../src/index';

describe('describeStep', () => {
	it('renders friendly sentences for every step type', () => {
		const t = parseTest({
			steps: [
				{ type: 'goto', url: 'https://shop.test/' },
				{ type: 'click', locator: { role: 'button', name: 'Sign in' } },
				{ type: 'fill', locator: { role: 'textbox', name: 'Email' }, value: 'a@b.com' },
				{ type: 'assertVisible', locator: { role: 'heading', name: 'Welcome' } },
				{ type: 'assertText', locator: { css: 'text=Total' }, text: '$42' },
				{ type: 'assertUrl', url: '/dashboard' },
				{ type: 'screenshot' },
				{ type: 'aiStep', instruction: 'accept the cookie banner' },
			],
		});
		const lines = t.steps.map(describeStep);
		expect(lines).toEqual([
			'Go to https://shop.test/',
			'Click the "Sign in" button',
			'Type "a@b.com" into the "Email" text box',
			'Check that the "Welcome" heading is visible',
			'Check that the element that says "Total" contains "$42"',
			'Check the web address contains /dashboard',
			'Take a screenshot',
			'AI: accept the cookie banner',
		]);
	});
});
