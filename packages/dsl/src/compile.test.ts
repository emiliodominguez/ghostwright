import { describe, expect, it, vi } from 'vitest';
import { compile, parseTest, resolveLocator, stepSchema, type Step } from './index';
import type { RunContext, StepLocator, StepPage } from './runtime';

/** A fake locator that records every method call. */
function fakeLocator(tag: string, calls: string[]): StepLocator {
	return {
		click: vi.fn(async () => void calls.push(`${tag}.click`)),
		dblclick: vi.fn(async () => void calls.push(`${tag}.dblclick`)),
		fill: vi.fn(async (v: string) => void calls.push(`${tag}.fill(${v})`)),
		press: vi.fn(async (k: string) => void calls.push(`${tag}.press(${k})`)),
		hover: vi.fn(async () => void calls.push(`${tag}.hover`)),
		selectOption: vi.fn(async (v) => void calls.push(`${tag}.selectOption(${String(v)})`)),
		waitFor: vi.fn(async (o) => void calls.push(`${tag}.waitFor(${JSON.stringify(o)})`)),
		screenshot: vi.fn(async () => Buffer.from('img')),
		textContent: vi.fn(async () => `${tag}-text`),
		dragTo: vi.fn(async () => void calls.push(`${tag}.dragTo`)),
		scrollIntoViewIfNeeded: vi.fn(async () => void calls.push(`${tag}.scrollIntoView`)),
		setInputFiles: vi.fn(async (f) => void calls.push(`${tag}.setInputFiles(${String(f)})`)),
		count: vi.fn(async () => 1),
		nth: vi.fn((n: number) => {
			calls.push(`${tag}.nth(${n})`);
			return fakeLocator(tag, calls);
		}),
	};
}

/** A fake page recording navigation + which locator strategy was used. */
function fakePage(calls: string[]) {
	const page: StepPage = {
		goto: vi.fn(async (url: string) => void calls.push(`goto(${url})`)),
		getByRole: vi.fn((role: string, opts?: { name?: string }) => {
			calls.push(`getByRole(${role},${opts?.name ?? ''})`);
			return fakeLocator('role', calls);
		}),
		locator: vi.fn((sel: string) => {
			calls.push(`locator(${sel})`);
			return fakeLocator('css', calls);
		}),
		getByText: vi.fn((t: string, o?: { exact?: boolean }) => {
			calls.push(`getByText(${t}${o?.exact ? ',exact' : ''})`);
			return fakeLocator('text', calls);
		}),
		getByPlaceholder: vi.fn((t: string) => {
			calls.push(`getByPlaceholder(${t})`);
			return fakeLocator('placeholder', calls);
		}),
		getByLabel: vi.fn((t: string) => {
			calls.push(`getByLabel(${t})`);
			return fakeLocator('label', calls);
		}),
		getByTestId: vi.fn((t: string) => {
			calls.push(`getByTestId(${t})`);
			return fakeLocator('testId', calls);
		}),
		getByAltText: vi.fn((t: string) => {
			calls.push(`getByAltText(${t})`);
			return fakeLocator('altText', calls);
		}),
		getByTitle: vi.fn((t: string) => {
			calls.push(`getByTitle(${t})`);
			return fakeLocator('title', calls);
		}),
		frameLocator: vi.fn((sel: string) => {
			calls.push(`frameLocator(${sel})`);
			return {
				getByRole: vi.fn((role: string, opts?: { name?: string }) => {
					calls.push(`frame.getByRole(${role},${opts?.name ?? ''})`);
					return fakeLocator('role', calls);
				}),
				getByText: vi.fn((t: string) => {
					calls.push(`frame.getByText(${t})`);
					return fakeLocator('text', calls);
				}),
				getByPlaceholder: vi.fn((_t: string) => fakeLocator('placeholder', calls)),
				getByLabel: vi.fn((_t: string) => fakeLocator('label', calls)),
				getByTestId: vi.fn((_t: string) => fakeLocator('testId', calls)),
				getByAltText: vi.fn((_t: string) => fakeLocator('altText', calls)),
				getByTitle: vi.fn((_t: string) => fakeLocator('title', calls)),
				locator: vi.fn((sel2: string) => {
					calls.push(`frame.locator(${sel2})`);
					return fakeLocator('css', calls);
				}),
			};
		}),
		waitForTimeout: vi.fn(async (ms: number) => void calls.push(`waitForTimeout(${ms})`)),
		waitForURL: vi.fn(async (u: unknown) => void calls.push(`waitForURL(${String(u)})`)),
		waitForLoadState: vi.fn(async (s?: string) => void calls.push(`waitForLoadState(${s ?? ''})`)),
		screenshot: vi.fn(async () => Buffer.from('img')),
		url: vi.fn(() => 'https://example.com/dashboard'),
		keyboard: { press: vi.fn(async (k: string) => void calls.push(`keyboard.press(${k})`)) },
		goBack: vi.fn(async () => void calls.push('goBack')),
		reload: vi.fn(async () => void calls.push('reload')),
		evaluate: vi.fn(async (expr: string) => {
			calls.push(`evaluate(${expr})`);
			return true;
		}),
	};
	return page;
}

/** A fake expect recording the assertion method invoked. */
function fakeCtx(calls: string[]): RunContext {
	const neg = {
		toBeVisible: vi.fn(async () => void calls.push('assert.not.toBeVisible')),
		toBeAttached: vi.fn(async () => void calls.push('assert.not.toBeAttached')),
		toHaveText: vi.fn(async (e: string | RegExp) => void calls.push(`assert.not.toHaveText(${String(e)})`)),
		toContainText: vi.fn(async (e: string) => void calls.push(`assert.not.toContainText(${e})`)),
	};
	return {
		expect: (_target) => ({
			toBeVisible: vi.fn(async () => void calls.push('assert.toBeVisible')),
			toBeHidden: vi.fn(async () => void calls.push('assert.toBeHidden')),
			toBeAttached: vi.fn(async () => void calls.push('assert.toBeAttached')),
			toHaveText: vi.fn(async (e) => void calls.push(`assert.toHaveText(${String(e)})`)),
			toContainText: vi.fn(async (e) => void calls.push(`assert.toContainText(${e})`)),
			toHaveURL: vi.fn(async (e) => void calls.push(`assert.toHaveURL(${String(e)})`)),
			toHaveCount: vi.fn(async (n) => void calls.push(`assert.toHaveCount(${n})`)),
			not: neg,
		}),
	};
}

async function runStep(raw: unknown, page: StepPage, ctx: RunContext) {
	const step = stepSchema.parse(raw) as Step;
	await compile(step).run(page, ctx);
}

describe('locator resolution', () => {
	it('prefers role + name (durable anchor)', () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		resolveLocator(page, { role: 'button', name: 'Sign in' });
		expect(calls).toContain('getByRole(button,Sign in)');
	});

	it('falls back to css when no role', () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		resolveLocator(page, { css: '#submit' });
		expect(calls).toContain('locator(#submit)');
	});

	it('falls back to aria-ref when only ref is given', () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		resolveLocator(page, { ref: 'e12' });
		expect(calls).toContain('locator(aria-ref=e12)');
	});
});

describe('compile — action steps', () => {
	it('goto navigates', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'goto', url: 'https://example.com' }, page, fakeCtx(calls));
		expect(calls).toEqual(['goto(https://example.com)']);
	});

	it('goto resolves relative URLs against baseUrl', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'goto', url: '/login' }, page, { ...fakeCtx(calls), baseUrl: 'https://app.test' });
		expect(calls).toEqual(['goto(https://app.test/login)']);
	});

	it('click resolves the locator then clicks', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'click', locator: { role: 'button', name: 'Go' } }, page, fakeCtx(calls));
		expect(calls).toEqual(['getByRole(button,Go)', 'role.click']);
	});

	it('fill types into the resolved element', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'fill', locator: { css: '#email' }, value: 'a@b.com' }, page, fakeCtx(calls));
		expect(calls).toEqual(['locator(#email)', 'css.fill(a@b.com)']);
	});

	it('press without a locator uses the keyboard', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'press', key: 'Enter' }, page, fakeCtx(calls));
		expect(calls).toEqual(['keyboard.press(Enter)']);
	});

	it('wait with a timeout only', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'wait', timeoutMs: 250 }, page, fakeCtx(calls));
		expect(calls).toEqual(['waitForTimeout(250)']);
	});
});

describe('compile — assertions', () => {
	it('assertText (contains) uses toContainText', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'assertText', locator: { role: 'heading' }, text: 'Welcome' }, page, fakeCtx(calls));
		expect(calls).toEqual(['getByRole(heading,)', 'assert.toContainText(Welcome)']);
	});

	it('assertText (exact) uses toHaveText', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'assertText', locator: { css: 'h1' }, text: 'Exact', mode: 'exact' }, page, fakeCtx(calls));
		expect(calls).toEqual(['locator(h1)', 'assert.toHaveText(Exact)']);
	});

	it('assertVisible uses toBeVisible', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'assertVisible', locator: { css: '.banner' } }, page, fakeCtx(calls));
		expect(calls).toEqual(['locator(.banner)', 'assert.toBeVisible']);
	});
});

describe('schema validation', () => {
	it('rejects a locator with no strategy', () => {
		expect(() => stepSchema.parse({ type: 'click', locator: {} })).toThrow();
	});

	it('parseTest validates a whole test', () => {
		const test = parseTest({ steps: [{ type: 'goto', url: 'https://x.test' }, { type: 'click', locator: { role: 'link', name: 'Next' } }] });
		expect(test.steps).toHaveLength(2);
	});

	it('aiStep runner errors without an AI resolver', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await expect(runStep({ type: 'aiStep', instruction: 'click login' }, page, fakeCtx(calls))).rejects.toThrow(/AI resolver/);
	});
});

describe('compile — custom code', () => {
	it('execJs evaluates the wrapped code in the page', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'execJs', code: 'window.foo = 1' }, page, fakeCtx(calls));
		expect(calls).toEqual(['evaluate((async () => { window.foo = 1 })())']);
	});

	it('assertJs passes when the code returns truthy', async () => {
		const calls: string[] = [];
		const page = fakePage(calls); // fake evaluate returns true
		await expect(runStep({ type: 'assertJs', code: 'return true' }, page, fakeCtx(calls))).resolves.toBeUndefined();
	});

	it('assertJs fails when the code returns falsy', async () => {
		const page = { ...fakePage([]), evaluate: async () => 0 };
		await expect(runStep({ type: 'assertJs', code: 'return document.title === "nope"' }, page, fakeCtx([]))).rejects.toThrow(/falsy/);
	});
});

describe('compile — variables', () => {
	it('setVar writes into ctx.vars, and a later step interpolates it', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		const ctx = { ...fakeCtx(calls), vars: {} as Record<string, string> };
		await runStep({ type: 'setVar', name: 'user', value: 'ada@x.test' }, page, ctx);
		expect(ctx.vars.user).toBe('ada@x.test');
		await runStep({ type: 'fill', locator: { css: '#email' }, value: 'hello {{user}}' }, page, ctx);
		expect(calls).toContain('css.fill(hello ada@x.test)');
	});

	it('interpolates a variable inside a locator name', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		const ctx = { ...fakeCtx(calls), vars: { label: 'Sign in' } };
		await runStep({ type: 'click', locator: { role: 'button', name: '{{label}}' } }, page, ctx);
		expect(calls).toContain('getByRole(button,Sign in)');
	});

	it('resolveVar supplies built-in fallbacks', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		const ctx = { ...fakeCtx(calls), vars: {}, resolveVar: (k: string) => (k === 'timestamp' ? '123' : undefined) };
		await runStep({ type: 'goto', url: 'https://x.test/?t={{timestamp}}' }, page, ctx);
		expect(calls).toContain('goto(https://x.test/?t=123)');
	});
});

describe('compile — extract, assertions, interactions (T3/T4)', () => {
	it('extract stores element text into a variable', async () => {
		const calls: string[] = [];
		const ctx = { ...fakeCtx(calls), vars: {} as Record<string, string> };
		await runStep({ type: 'extract', name: 'label', locator: { css: '.title' } }, fakePage(calls), ctx);
		expect(ctx.vars.label).toBe('css-text');
	});

	it('extractJs stores a JS result into a variable', async () => {
		const calls: string[] = [];
		const page = { ...fakePage(calls), evaluate: async () => 7 };
		const ctx = { ...fakeCtx(calls), vars: {} as Record<string, string> };
		await runStep({ type: 'extractJs', name: 'count', code: 'return 7' }, page, ctx);
		expect(ctx.vars.count).toBe('7');
	});

	it('assertNotPresent uses the negated matcher', async () => {
		const calls: string[] = [];
		await runStep({ type: 'assertNotPresent', locator: { css: '.gone' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toContain('assert.not.toBeAttached');
	});

	it('double-click and right-click dispatch correctly', async () => {
		const calls: string[] = [];
		await runStep({ type: 'click', locator: { css: '#a' }, double: true }, fakePage(calls), fakeCtx(calls));
		expect(calls).toContain('css.dblclick');
	});

	it('back and refresh navigate', async () => {
		const calls: string[] = [];
		const page = fakePage(calls);
		await runStep({ type: 'back' }, page, fakeCtx(calls));
		await runStep({ type: 'refresh' }, page, fakeCtx(calls));
		expect(calls).toEqual(expect.arrayContaining(['goBack', 'reload']));
	});
});

describe('locator strategies', () => {
	const strategies: [Record<string, unknown>, string][] = [
		[{ text: 'Buy now' }, 'getByText(Buy now)'],
		[{ placeholder: 'Email' }, 'getByPlaceholder(Email)'],
		[{ label: 'Password' }, 'getByLabel(Password)'],
		[{ testId: 'submit' }, 'getByTestId(submit)'],
		[{ altText: 'Logo' }, 'getByAltText(Logo)'],
		[{ title: 'Close' }, 'getByTitle(Close)'],
		[{ xpath: '//button' }, 'locator(xpath=//button)'],
	];
	for (const [loc, expected] of strategies) {
		it(`resolves ${Object.keys(loc)[0]}`, () => {
			const calls: string[] = [];
			resolveLocator(fakePage(calls), loc as never);
			expect(calls).toContain(expected);
		});
	}

	it('applies nth', () => {
		const calls: string[] = [];
		resolveLocator(fakePage(calls), { css: '.item', nth: 2 } as never);
		expect(calls).toContain('css.nth(2)');
	});

	it('passes exact for text strategies', () => {
		const calls: string[] = [];
		resolveLocator(fakePage(calls), { text: 'OK', exact: true } as never);
		expect(calls).toContain('getByText(OK,exact)');
	});
});

describe('healLocator — self-healing selectors', () => {
	it('falls back to a backup selector when the primary has no match', async () => {
		const calls: string[] = [];
		const roleLoc = { ...fakeLocator('role', calls), count: async () => 0 };
		const cssLoc = { ...fakeLocator('css', calls), count: async () => 1 };
		const page = { ...fakePage(calls), getByRole: () => roleLoc as never, locator: () => cssLoc as never };
		await runStep({ type: 'click', locator: { role: 'button', name: 'Save', fallbacks: [{ css: '#save' }] } }, page, fakeCtx(calls));
		expect(calls).toContain('css.click');
		expect(calls).not.toContain('role.click');
	});

	it('uses the primary when it matches (no fallbacks probed)', async () => {
		const calls: string[] = [];
		await runStep({ type: 'click', locator: { role: 'button', name: 'Save', fallbacks: [{ css: '#save' }] } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toContain('role.click');
		expect(calls).not.toContain('css.click');
	});
});

describe('compile — every remaining step run() path', () => {
	it('hover moves over the resolved element', async () => {
		const calls: string[] = [];
		await runStep({ type: 'hover', locator: { css: '#menu' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['locator(#menu)', 'css.hover']);
	});

	it('select chooses interpolated option values', async () => {
		const calls: string[] = [];
		const ctx = { ...fakeCtx(calls), vars: { pick: 'blue' } };
		await runStep({ type: 'select', locator: { css: '#color' }, values: ['{{pick}}', 'red'] }, fakePage(calls), ctx);
		expect(calls).toEqual(['locator(#color)', 'css.selectOption(blue,red)']);
	});

	it('press with a locator presses the key on that element', async () => {
		const calls: string[] = [];
		await runStep({ type: 'press', key: 'Enter', locator: { css: '#input' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['locator(#input)', 'css.press(Enter)']);
	});

	it('wait with a locator waits for the given state', async () => {
		const calls: string[] = [];
		await runStep({ type: 'wait', locator: { css: '#spinner' }, state: 'hidden', timeoutMs: 500 }, fakePage(calls), fakeCtx(calls));
		expect(calls).toContain('locator(#spinner)');
		expect(calls).toContain('css.waitFor({"state":"hidden","timeout":500})');
	});

	it('waitForUrl without a timeout', async () => {
		const calls: string[] = [];
		await runStep({ type: 'waitForUrl', url: 'https://x.test/done' }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['waitForURL(https://x.test/done)']);
	});

	it('waitForUrl with a timeout and interpolation', async () => {
		const calls: string[] = [];
		const ctx = { ...fakeCtx(calls), vars: { path: 'ok' } };
		await runStep({ type: 'waitForUrl', url: 'https://x.test/{{path}}', timeoutMs: 3000 }, fakePage(calls), ctx);
		expect(calls).toEqual(['waitForURL(https://x.test/ok)']);
	});

	it('waitForLoadState waits for the given state', async () => {
		const calls: string[] = [];
		await runStep({ type: 'waitForLoadState', state: 'domcontentloaded' }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['waitForLoadState(domcontentloaded)']);
	});

	it('assertNotVisible uses toBeHidden', async () => {
		const calls: string[] = [];
		await runStep({ type: 'assertNotVisible', locator: { css: '.gone' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['locator(.gone)', 'assert.toBeHidden']);
	});

	it('assertPresent uses toBeAttached', async () => {
		const calls: string[] = [];
		await runStep({ type: 'assertPresent', locator: { css: '.here' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['locator(.here)', 'assert.toBeAttached']);
	});

	it('assertNotText (contains) uses negated toContainText', async () => {
		const calls: string[] = [];
		await runStep({ type: 'assertNotText', locator: { css: 'h1' }, text: 'Oops' }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['locator(h1)', 'assert.not.toContainText(Oops)']);
	});

	it('assertNotText (exact) uses negated toHaveText', async () => {
		const calls: string[] = [];
		await runStep({ type: 'assertNotText', locator: { css: 'h1' }, text: 'Error', mode: 'exact' }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['locator(h1)', 'assert.not.toHaveText(Error)']);
	});

	it('dragAndDrop resolves both ends and drags', async () => {
		const calls: string[] = [];
		await runStep({ type: 'dragAndDrop', from: { css: '#src' }, to: { css: '#dst' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toContain('css.dragTo');
	});

	it('scroll with a locator scrolls it into view', async () => {
		const calls: string[] = [];
		await runStep({ type: 'scroll', locator: { css: '#footer' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['locator(#footer)', 'css.scrollIntoView']);
	});

	it('scroll without a locator scrolls to the bottom of the page', async () => {
		const calls: string[] = [];
		await runStep({ type: 'scroll' }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['evaluate(window.scrollTo(0, document.body.scrollHeight))']);
	});

	it('upload sets input files, resolving each file ref', async () => {
		const calls: string[] = [];
		const ctx = { ...fakeCtx(calls), resolveFile: async (r: string) => `/local/${r}` };
		await runStep({ type: 'upload', locator: { css: 'input[type=file]' }, files: ['a.pdf', 'b.pdf'] }, fakePage(calls), ctx);
		expect(calls).toContain('css.setInputFiles(/local/a.pdf,/local/b.pdf)');
	});

	it('upload without a resolveFile uses the raw refs', async () => {
		const calls: string[] = [];
		await runStep({ type: 'upload', locator: { css: 'input[type=file]' }, files: ['/tmp/x.png'] }, fakePage(calls), fakeCtx(calls));
		expect(calls).toContain('css.setInputFiles(/tmp/x.png)');
	});

	it('assertUrl (exact) matches the interpolated absolute URL', async () => {
		const calls: string[] = [];
		const ctx = { ...fakeCtx(calls), baseUrl: 'https://app.test' };
		await runStep({ type: 'assertUrl', url: '/dashboard', exact: true }, fakePage(calls), ctx);
		expect(calls).toContain('assert.toHaveURL(https://app.test/dashboard)');
	});

	it('assertUrl (non-exact) matches a regex built from the escaped URL', async () => {
		const calls: string[] = [];
		await runStep({ type: 'assertUrl', url: 'https://x.test/a.b?c=1' }, fakePage(calls), fakeCtx(calls));
		const urlCall = calls.find((c) => c.startsWith('assert.toHaveURL'));
		expect(urlCall).toBeDefined();
		// escapeRegExp escapes the dots and query metacharacters
		expect(urlCall).toContain('a\\.b');
	});

	it('screenshot captures the page (fullPage flag)', async () => {
		const calls: string[] = [];
		const shot = vi.fn(async () => Buffer.from('img'));
		const page = { ...fakePage(calls), screenshot: shot };
		await runStep({ type: 'screenshot', fullPage: true }, page, fakeCtx(calls));
		expect(shot).toHaveBeenCalledWith({ fullPage: true });
	});

	it('totp fills the resolved code from the secret resolver', async () => {
		const calls: string[] = [];
		const ctx = { ...fakeCtx(calls), totp: async (secret: string) => `code-for-${secret}` };
		await runStep({ type: 'totp', locator: { css: '#otp' }, secret: 'JBSWY3DP' }, fakePage(calls), ctx);
		expect(calls).toContain('css.fill(code-for-JBSWY3DP)');
	});

	it('totp errors without a secret resolver', async () => {
		await expect(runStep({ type: 'totp', locator: { css: '#otp' }, secret: 'S' }, fakePage([]), fakeCtx([]))).rejects.toThrow(/secret resolver/);
	});

	it('aiStep clicks the AI-resolved element', async () => {
		const calls: string[] = [];
		const aiLoc = fakeLocator('ai', calls);
		const ctx = { ...fakeCtx(calls), ai: async () => aiLoc };
		await runStep({ type: 'aiStep', instruction: 'click login' }, fakePage(calls), ctx);
		expect(calls).toContain('ai.click');
	});

	it('actionRef run() throws (must be expanded first)', async () => {
		await expect(runStep({ type: 'actionRef', actionId: 'a1' }, fakePage([]), fakeCtx([]))).rejects.toThrow(/expanded/);
	});

	it('single click with an explicit button passes the button option', async () => {
		const calls: string[] = [];
		const clickSpy = vi.fn(async () => void calls.push('clicked'));
		const loc = { ...fakeLocator('css', calls), click: clickSpy };
		const page = { ...fakePage(calls), locator: () => loc as never };
		await runStep({ type: 'click', locator: { css: '#a' }, button: 'right' }, page, fakeCtx(calls));
		expect(clickSpy).toHaveBeenCalledWith({ button: 'right' });
	});

	it('wait without a locator or timeout defaults to 1000ms', async () => {
		const calls: string[] = [];
		await runStep({ type: 'wait' }, fakePage(calls), fakeCtx(calls));
		expect(calls).toEqual(['waitForTimeout(1000)']);
	});

	it('extract stores an empty string when textContent is null', async () => {
		const calls: string[] = [];
		const loc = { ...fakeLocator('css', calls), textContent: async () => null };
		const page = { ...fakePage(calls), locator: () => loc as never };
		const ctx = { ...fakeCtx(calls), vars: {} as Record<string, string> };
		await runStep({ type: 'extract', name: 'v', locator: { css: '.x' } }, page, ctx);
		expect(ctx.vars.v).toBe('');
	});

	it('extractJs stores an empty string when the JS result is null', async () => {
		const calls: string[] = [];
		const page = { ...fakePage(calls), evaluate: async () => null };
		const ctx = { ...fakeCtx(calls), vars: {} as Record<string, string> };
		await runStep({ type: 'extractJs', name: 'v', code: 'return null' }, page, ctx);
		expect(ctx.vars.v).toBe('');
	});
});

describe('compile — frame + role option branches', () => {
	it('resolves a locator inside an iframe via frameLocator', () => {
		const calls: string[] = [];
		resolveLocator(fakePage(calls), { role: 'button', name: 'Go', frame: 'iframe#app' } as never);
		expect(calls).toContain('frameLocator(iframe#app)');
		expect(calls).toContain('frame.getByRole(button,Go)');
	});

	it('role with exact but no name still passes the exact option', () => {
		const calls: string[] = [];
		const getByRole = vi.fn((role: string, opts?: { exact?: boolean }) => {
			calls.push(`getByRole(${role},exact=${String(opts?.exact)})`);
			return fakeLocator('role', calls);
		});
		const page = { ...fakePage(calls), getByRole };
		resolveLocator(page, { role: 'heading', exact: true } as never);
		expect(getByRole).toHaveBeenCalledWith('heading', { exact: true });
	});
});

describe('compile — visualCheck', () => {
	function visualCtx(calls: string[], captured: unknown[]): RunContext {
		return {
			...fakeCtx(calls),
			onVisualCheck: async (name: string, image: Buffer, opts: unknown) => void captured.push({ name, opts }),
		};
	}

	it('captures the full page and forwards it to the sink', async () => {
		const calls: string[] = [];
		const captured: unknown[] = [];
		await runStep({ type: 'visualCheck', name: 'home', fullPage: true }, fakePage(calls), visualCtx(calls, captured));
		expect(captured).toHaveLength(1);
		expect(captured[0]).toMatchObject({ name: 'home', opts: { fullPage: true } });
	});

	it('hides excluded selectors then captures a specific element', async () => {
		const calls: string[] = [];
		const captured: unknown[] = [];
		await runStep(
			{ type: 'visualCheck', name: 'card', selector: '.card', exclude: ['.clock'], tolerancePct: 5 },
			fakePage(calls),
			visualCtx(calls, captured),
		);
		expect(calls.some((c) => c.startsWith('evaluate(') && c.includes('visibility'))).toBe(true);
		expect(calls).toContain('locator(.card)');
		expect(captured[0]).toMatchObject({ name: 'card', opts: { tolerancePct: 5 } });
	});

	it('errors without a visual sink', async () => {
		await expect(runStep({ type: 'visualCheck', name: 'x' }, fakePage([]), fakeCtx([]))).rejects.toThrow(/visual sink/);
	});
});

describe('compile — per-step retry overrides + heal edge', () => {
	it('carries retries and retryDelayMs onto the compiled step', () => {
		const compiled = compile(stepSchema.parse({ type: 'refresh', retries: 3, retryDelayMs: 250 }) as Step);
		expect(compiled.retries).toBe(3);
		expect(compiled.retryDelayMs).toBe(250);
	});

	it('healLocator returns the primary when all candidates fail to match', async () => {
		const calls: string[] = [];
		const zero = { ...fakeLocator('role', calls), count: async () => 0 };
		const zeroCss = { ...fakeLocator('css', calls), count: async () => 0 };
		const page = { ...fakePage(calls), getByRole: () => zero as never, locator: () => zeroCss as never };
		// Neither the primary nor the fallback matches — falls back to the primary (list[0]).
		await runStep({ type: 'click', locator: { role: 'button', name: 'X', fallbacks: [{ css: '#x' }] } }, page, fakeCtx(calls));
		expect(calls).toContain('role.click');
	});

	it('healLocator survives a candidate whose count() throws', async () => {
		const calls: string[] = [];
		const throwing = { ...fakeLocator('role', calls), count: async () => { throw new Error('bad selector'); } };
		const good = { ...fakeLocator('css', calls), count: async () => 1 };
		const page = { ...fakePage(calls), getByRole: () => throwing as never, locator: () => good as never };
		await runStep({ type: 'click', locator: { role: 'button', name: 'X', fallbacks: [{ css: '#x' }] } }, page, fakeCtx(calls));
		expect(calls).toContain('css.click');
	});
});

describe('compile — conditional + exit (T5)', () => {
	it('a step with a truthy condition should run', async () => {
		const page = { ...fakePage([]), evaluate: async () => true };
		const compiled = compile(stepSchema.parse({ type: 'refresh', condition: 'return true' }) as Step);
		expect(await compiled.shouldRun?.(page, fakeCtx([]))).toBe(true);
	});

	it('a step with a falsy condition should be skipped', async () => {
		const page = { ...fakePage([]), evaluate: async () => false };
		const compiled = compile(stepSchema.parse({ type: 'refresh', condition: 'return false' }) as Step);
		expect(await compiled.shouldRun?.(page, fakeCtx([]))).toBe(false);
	});

	it('exit throws an ExitTest carrying the verdict', async () => {
		const compiled = compile(stepSchema.parse({ type: 'exit', pass: false }) as Step);
		await expect(compiled.run(fakePage([]), fakeCtx([]))).rejects.toMatchObject({ name: 'ExitTest', pass: false });
	});
});
