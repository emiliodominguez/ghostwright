import { describe, expect, it } from 'vitest';
import { describeStep, describeSegments, describeLocator, parseTest, stepSchema, type Step } from './index';

/** Parse a raw step and describe it as a flat string. */
function desc(raw: unknown): string {
	return describeStep(stepSchema.parse(raw) as Step);
}

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

describe('describeStep — every step type', () => {
	it('click variants: plain, double, right', () => {
		expect(desc({ type: 'click', locator: { css: '#a' } })).toBe('Click the element `#a`');
		expect(desc({ type: 'click', locator: { css: '#a' }, double: true })).toBe('Double-click the element `#a`');
		expect(desc({ type: 'click', locator: { css: '#a' }, button: 'right' })).toBe('Right-click the element `#a`');
	});

	it('press with and without a locator', () => {
		expect(desc({ type: 'press', key: 'Enter' })).toBe('Press the `Enter` key');
		expect(desc({ type: 'press', key: 'Tab', locator: { css: '#f' } })).toBe('Press the `Tab` key in the element `#f`');
	});

	it('hover', () => {
		expect(desc({ type: 'hover', locator: { role: 'button', name: 'Menu' } })).toBe('Hover over the "Menu" button');
	});

	it('select with one and several values', () => {
		expect(desc({ type: 'select', locator: { css: '#c' }, values: ['Red'] })).toBe('Choose "Red" in the element `#c`');
		expect(desc({ type: 'select', locator: { css: '#c' }, values: ['Red', 'Blue'] })).toBe('Choose "Red", "Blue" in the element `#c`');
	});

	it('wait: element form and time form', () => {
		expect(desc({ type: 'wait', locator: { css: '#s' }, state: 'hidden' })).toBe('Wait for the element `#s` to be hidden');
		expect(desc({ type: 'wait', locator: { css: '#s' } })).toBe('Wait for the element `#s` to be visible');
		expect(desc({ type: 'wait', timeoutMs: 2000 })).toBe('Wait 2 seconds');
		expect(desc({ type: 'wait' })).toBe('Wait 1 seconds');
	});

	it('waitForUrl', () => {
		expect(desc({ type: 'waitForUrl', url: '/done' })).toBe('Wait until the web address matches "/done"');
	});

	it('waitForLoadState: networkidle and other states', () => {
		expect(desc({ type: 'waitForLoadState', state: 'networkidle' })).toBe('Wait for the page to settle (no network activity)');
		expect(desc({ type: 'waitForLoadState', state: 'load' })).toBe('Wait for the page "load" event');
	});

	it('assertText exact vs contains', () => {
		expect(desc({ type: 'assertText', locator: { css: 'h1' }, text: 'Hi', mode: 'exact' })).toBe('Check that the element `h1` says exactly "Hi"');
		expect(desc({ type: 'assertText', locator: { css: 'h1' }, text: 'Hi' })).toBe('Check that the element `h1` contains "Hi"');
	});

	it('assertNotText exact vs contains', () => {
		expect(desc({ type: 'assertNotText', locator: { css: 'h1' }, text: 'Err', mode: 'exact' })).toBe('Check that the element `h1` does not say "Err"');
		expect(desc({ type: 'assertNotText', locator: { css: 'h1' }, text: 'Err' })).toBe('Check that the element `h1` does not contain "Err"');
	});

	it('visibility / presence assertions', () => {
		expect(desc({ type: 'assertVisible', locator: { css: '.b' } })).toBe('Check that the element `.b` is visible');
		expect(desc({ type: 'assertNotVisible', locator: { css: '.b' } })).toBe('Check that the element `.b` is not visible');
		expect(desc({ type: 'assertPresent', locator: { css: '.b' } })).toBe('Check that the element `.b` exists on the page');
		expect(desc({ type: 'assertNotPresent', locator: { css: '.b' } })).toBe('Check that the element `.b` does not exist on the page');
	});

	it('dragAndDrop', () => {
		expect(desc({ type: 'dragAndDrop', from: { css: '#s' }, to: { css: '#d' } })).toBe('Drag the element `#s` onto the element `#d`');
	});

	it('scroll with and without a locator', () => {
		expect(desc({ type: 'scroll', locator: { css: '#f' } })).toBe('Scroll to the element `#f`');
		expect(desc({ type: 'scroll' })).toBe('Scroll to the bottom of the page');
	});

	it('back and refresh', () => {
		expect(desc({ type: 'back' })).toBe('Go back to the previous page');
		expect(desc({ type: 'refresh' })).toBe('Refresh the page');
	});

	it('upload singular vs plural', () => {
		expect(desc({ type: 'upload', locator: { css: '#u' }, files: ['a.pdf'] })).toBe('Upload 1 file to the element `#u`');
		expect(desc({ type: 'upload', locator: { css: '#u' }, files: ['a.pdf', 'b.pdf'] })).toBe('Upload 2 files to the element `#u`');
	});

	it('extract and extractJs', () => {
		expect(desc({ type: 'extract', name: 'title', locator: { role: 'heading' } })).toBe('Save the text of the heading into "title"');
		expect(desc({ type: 'extractJs', name: 'n', code: 'return 1' })).toBe('Save a custom-code result into "n"');
	});

	it('exit pass and fail', () => {
		expect(desc({ type: 'exit', pass: true })).toBe('Stop the test here (pass)');
		expect(desc({ type: 'exit', pass: false })).toBe('Stop the test here (fail)');
	});

	it('actionRef with and without a name', () => {
		expect(desc({ type: 'actionRef', actionId: 'a1', name: 'Log in' })).toBe('Run the "Log in" action');
		expect(desc({ type: 'actionRef', actionId: 'a1' })).toBe('Run the "reusable" action');
	});

	it('assertUrl exact vs contains', () => {
		expect(desc({ type: 'assertUrl', url: '/x', exact: true })).toBe('Check the web address is /x');
		expect(desc({ type: 'assertUrl', url: '/x' })).toBe('Check the web address contains /x');
	});

	it('screenshot with and without a name', () => {
		expect(desc({ type: 'screenshot', name: 'home' })).toBe('Take a screenshot ("home")');
		expect(desc({ type: 'screenshot' })).toBe('Take a screenshot');
	});

	it('visualCheck', () => {
		expect(desc({ type: 'visualCheck', name: 'home' })).toBe('Compare the page against the saved look "home"');
	});

	it('totp, setVar, execJs, assertJs', () => {
		expect(desc({ type: 'totp', locator: { css: '#o' }, secret: 'S' })).toBe('Enter the 2-factor code into the element `#o`');
		expect(desc({ type: 'setVar', name: 'u', value: 'v' })).toBe('Set "u" to "v"');
		expect(desc({ type: 'execJs', code: 'x' })).toBe('Run custom code');
		expect(desc({ type: 'assertJs', code: 'return x' })).toBe('Check with custom code');
	});
});

describe('describeLocator — every strategy and modifier', () => {
	it('role with and without a name, and a role with no friendly noun', () => {
		expect(describeLocator({ role: 'button', name: 'Save' })).toBe('the "Save" button');
		expect(describeLocator({ role: 'button' })).toBe('the button');
		expect(describeLocator({ role: 'switch' })).toBe('the switch');
	});

	it('text / placeholder / label / testId / altText / title strategies', () => {
		expect(describeLocator({ text: 'Buy' })).toBe('the element that says "Buy"');
		expect(describeLocator({ placeholder: 'Email' })).toBe('the field with placeholder "Email"');
		expect(describeLocator({ label: 'Password' })).toBe('the field labeled "Password"');
		expect(describeLocator({ testId: 'submit' })).toBe('the element with test id "submit"');
		expect(describeLocator({ altText: 'Logo' })).toBe('the image "Logo"');
		expect(describeLocator({ title: 'Close' })).toBe('the element titled "Close"');
	});

	it('css: plain selector vs a text= pseudo-selector', () => {
		expect(describeLocator({ css: '#submit' })).toBe('the element `#submit`');
		expect(describeLocator({ css: 'text=Total' })).toBe('the element that says "Total"');
	});

	it('xpath and ref', () => {
		expect(describeLocator({ xpath: '//button' })).toBe('the element at `//button`');
		expect(describeLocator({ ref: 'e12' })).toBe('the element');
	});

	it('nth and frame modifiers append disambiguators', () => {
		expect(describeLocator({ css: '.item', nth: 2 })).toBe('the element `.item` (#3)');
		expect(describeLocator({ css: '.item', frame: 'iframe' })).toBe('the element `.item` (in the embedded frame)');
	});
});

describe('describeSegments — segment kinds', () => {
	it('tags url, value, and code kinds distinctly', () => {
		const goto = describeSegments(stepSchema.parse({ type: 'goto', url: 'https://x.test/' }) as Step);
		expect(goto).toContainEqual({ kind: 'url', text: 'https://x.test/' });

		const css = describeSegments(stepSchema.parse({ type: 'click', locator: { css: '#a' } }) as Step);
		expect(css).toContainEqual({ kind: 'code', text: '#a' });

		const nth = describeSegments(stepSchema.parse({ type: 'click', locator: { css: '#a', nth: 0 } }) as Step);
		expect(nth).toContainEqual({ kind: 'nth', text: '(#1)' });
	});
});
