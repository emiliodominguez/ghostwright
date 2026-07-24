import { describe, expect, it } from 'vitest';
import { fromCode, parseTest, toCode } from './index';

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

	it('round-trips rich locators (strategies, exact, nth, fallbacks)', () => {
		const t = parseTest({
			steps: [
				{ type: 'click', locator: { text: 'Buy now', exact: true, nth: 1, fallbacks: [{ testId: 'buy' }, { css: '.buy-btn' }] } },
				{ type: 'fill', locator: { placeholder: 'Search' }, value: 'shoes' },
				{ type: 'assertVisible', locator: { xpath: '//h1' } },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
	});

	it('round-trips per-step conditions (via only(...))', () => {
		const t = parseTest({
			steps: [
				{ type: 'refresh', condition: 'return isLoggedIn' },
				{ type: 'click', locator: { css: '#x' } },
				{ type: 'goto', url: '/y', condition: 'return {{count}} > 0' },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
		expect(toCode(t).split('\n')[0]).toBe('only("return isLoggedIn", () => refresh())');
	});

	it('round-trips setVar and uses interpolation syntax', () => {
		const t = parseTest({ steps: [{ type: 'setVar', name: 'email', value: '{{internet.email}}' }] });
		expect(fromCode(toCode(t))).toEqual(t);
		expect(toCode(t)).toBe('setVar("email", "{{internet.email}}")');
	});

	it('round-trips hover, select, wait (element), waitForUrl, waitForLoadState', () => {
		const t = parseTest({
			steps: [
				{ type: 'hover', locator: { role: 'button', name: 'Menu' } },
				{ type: 'select', locator: { css: '#color' }, values: ['red', 'blue'] },
				{ type: 'wait', locator: { css: '#spinner' }, state: 'hidden', timeoutMs: 500 },
				{ type: 'waitForUrl', url: '/done', timeoutMs: 3000 },
				{ type: 'waitForUrl', url: '/other' },
				{ type: 'waitForLoadState', state: 'load' },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
		const code = toCode(t);
		expect(code).toContain('hover({ role: "button", name: "Menu" })');
		expect(code).toContain('select({ css: "#color" }, ["red","blue"])');
		expect(code).toContain('waitForUrl("/done", 3000)');
		expect(code).toContain('waitForUrl("/other")');
		expect(code).toContain('waitForLoadState("load")');
	});

	it('round-trips actionRef, screenshot, visualCheck, ai, totp', () => {
		const t = parseTest({
			steps: [
				{ type: 'actionRef', actionId: 'a1', name: 'Log in' },
				{ type: 'actionRef', actionId: 'a2' },
				{ type: 'screenshot', name: 'home', fullPage: true },
				{
					type: 'visualCheck',
					name: 'card',
					fullPage: false,
					ignoreRegions: [{ x1: 0, y1: 0, x2: 10, y2: 10 }],
					tolerancePct: 5,
					exclude: ['.clock'],
					selector: '.card',
				},
				{ type: 'aiStep', instruction: 'accept cookies' },
				{ type: 'totp', locator: { css: '#otp' }, secret: 'JBSWY3DP' },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
		const code = toCode(t);
		expect(code).toContain('actionRef("a1", "Log in")');
		expect(code).toContain('actionRef("a2")');
		expect(code).toContain('ai("accept cookies")');
		expect(code).toContain('totp({ css: "#otp" }, "JBSWY3DP")');
		expect(code).toContain('visualCheck("card"');
	});

	it('round-trips branch variants: press w/ locator, wait w/o timeout, assertNotText exact, visualCheck minimal', () => {
		const t = parseTest({
			steps: [
				{ type: 'press', key: 'Tab', locator: { css: '#f' } },
				{ type: 'wait', locator: { css: '#s' } },
				{ type: 'assertNotText', locator: { css: 'h1' }, text: 'Err', mode: 'exact' },
				{ type: 'visualCheck', name: 'bare', fullPage: false },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
		const code = toCode(t);
		expect(code).toContain('press("Tab", { css: "#f" })');
		expect(code).toContain('assertNotText({ css: "h1" }, "Err", "exact")');
		expect(code).toContain('visualCheck("bare"');
	});

	it('round-trips a screenshot with no name', () => {
		const t = parseTest({ steps: [{ type: 'screenshot', fullPage: false }] });
		expect(fromCode(toCode(t))).toEqual(t);
	});

	it('round-trips assertUrl without exact and a bare scroll', () => {
		const t = parseTest({
			steps: [
				{ type: 'assertUrl', url: '/home' },
				{ type: 'scroll' },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
		const code = toCode(t);
		expect(code).toContain('assertUrl("/home")');
		expect(code).toContain('scroll()');
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
				{ type: 'upload', locator: { css: 'input[type=file]' }, files: ['https://x.test/a.pdf'] },
				{ type: 'extract', name: 'title', locator: { role: 'heading' } },
				{ type: 'extractJs', name: 'n', code: 'return 1' },
				{ type: 'exit', pass: true },
			],
		});
		expect(fromCode(toCode(t))).toEqual(t);
	});
});
