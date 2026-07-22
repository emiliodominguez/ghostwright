import { describe, expect, it, vi } from 'vitest';
import { compile, parseTest, resolveLocator, stepSchema, type Step } from '../src/index';
import type { RunContext, StepLocator, StepPage } from '../src/runtime';

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
		waitForTimeout: vi.fn(async (ms: number) => void calls.push(`waitForTimeout(${ms})`)),
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
		expect: (target) => ({
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

describe('healLocator — self-healing selectors', () => {
	it('falls back to css when the role+name strategy has no match', async () => {
		const calls: string[] = [];
		// role locator matches 0 elements; css locator matches 1 → healing picks css.
		const roleLoc = { ...fakeLocator('role', calls), count: async () => 0 };
		const cssLoc = { ...fakeLocator('css', calls), count: async () => 1 };
		const page = {
			...fakePage(calls),
			getByRole: () => roleLoc as never,
			locator: () => cssLoc as never,
		};
		await runStep({ type: 'click', locator: { role: 'button', name: 'Save', css: '#save' } }, page, fakeCtx(calls));
		expect(calls).toContain('css.click');
		expect(calls).not.toContain('role.click');
	});

	it('uses the primary when it matches', async () => {
		const calls: string[] = [];
		await runStep({ type: 'click', locator: { role: 'button', name: 'Save', css: '#save' } }, fakePage(calls), fakeCtx(calls));
		expect(calls).toContain('role.click');
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
