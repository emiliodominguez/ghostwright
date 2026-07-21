import { describe, expect, it } from 'vitest';
import { fromCode, parseTest, toCode } from '../src/index';

const full = parseTest({
	steps: [
		{ type: 'goto', url: 'http://x.test/' },
		{ type: 'fill', locator: { css: '#email' }, value: 'a@b.com' },
		{ type: 'click', locator: { role: 'button', name: 'Sign in' } },
		{ type: 'assertText', locator: { role: 'heading' }, text: 'Welcome' },
		{ type: 'assertText', locator: { css: 'h1' }, text: 'Exact', mode: 'exact' },
		{ type: 'assertVisible', locator: { css: '.banner' } },
		{ type: 'assertUrl', url: '/dashboard', exact: true },
		{ type: 'press', key: 'Enter' },
		{ type: 'wait', timeoutMs: 500 },
	],
});

describe('codegen round-trip', () => {
	it('toCode → fromCode is identity (after schema normalization)', () => {
		expect(fromCode(toCode(full))).toEqual(full);
	});

	it('produces clean bare-call code', () => {
		const code = toCode(full);
		expect(code.split('\n')[0]).toBe('goto("http://x.test/")');
		expect(code).toContain('click({ role: "button", name: "Sign in" })');
		expect(code).toContain('assertText({ css: "h1" }, "Exact", "exact")');
	});

	it('fromCode validates and rejects a bad step', () => {
		expect(() => fromCode('click({})')).toThrow();
	});

	it('round-trips custom-code steps', () => {
		const t = parseTest({
			steps: [
				{ type: 'execJs', code: 'window.scrollTo(0, document.body.scrollHeight)' },
				{ type: 'assertJs', code: 'return document.title.length > 0' },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
		expect(toCode(t)).toContain('assertJs("return document.title.length > 0")');
	});

	it('round-trips setVar and uses interpolation syntax', () => {
		const t = parseTest({ steps: [{ type: 'setVar', name: 'email', value: '{{internet.email}}' }] });
		expect(fromCode(toCode(t))).toEqual(t);
		expect(toCode(t)).toBe('setVar("email", "{{internet.email}}")');
	});

	it('round-trips the T3/T4/T5 steps', () => {
		const t = parseTest({
			steps: [
				{ type: 'click', locator: { css: '#a' }, double: true },
				{ type: 'click', locator: { css: '#b' }, button: 'right' },
				{ type: 'assertNotVisible', locator: { css: '.spinner' } },
				{ type: 'assertPresent', locator: { role: 'dialog' } },
				{ type: 'assertNotPresent', locator: { css: '.error' } },
				{ type: 'assertNotText', locator: { css: 'h1' }, text: 'Error' },
				{ type: 'dragAndDrop', from: { css: '#src' }, to: { css: '#dst' } },
				{ type: 'scroll', locator: { css: '#footer' } },
				{ type: 'back' },
				{ type: 'refresh' },
				{ type: 'extract', name: 'title', locator: { role: 'heading' } },
				{ type: 'extractJs', name: 'n', code: 'return 1' },
				{ type: 'exit', pass: true },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
	});
});
