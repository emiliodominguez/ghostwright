import type { StepAssertion, StepExpect, StepLocator, StepPage } from '@ghostwright/dsl';
import { chromium, type Browser as RwBrowser, type Page as RwNativePage } from 'rustwright';

/**
 * Experimental browser engine backed by rustwright (a Rust CDP core with a
 * Playwright-shaped Node binding). It is opt-in and Chromium-only.
 *
 * rustwright's Node binding is selector-string based and small: goto, click,
 * fill, textContent, evaluate, screenshot. It has no locator objects, no
 * accessible-name/role targeting, no browser contexts, and therefore no
 * tracing, video, HAR, storageState, or multi-browser support. This adapter
 * maps the part of the DSL contract that fits (CSS-expressible targets plus
 * custom-code steps) and throws a clear error for anything that needs the
 * Playwright engine, so an unsupported test fails fast with a useful message
 * instead of behaving oddly.
 */

/** Thrown when a step needs a Playwright-only capability the rustwright engine lacks. */
export class EngineUnsupportedError extends Error {
	constructor(feature: string) {
		super(`The rustwright engine does not support ${feature}. Run this test on the Playwright engine.`);
		this.name = 'EngineUnsupportedError';
	}
}

/** Sleep for a number of milliseconds. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON-encode a selector for safe embedding in an evaluated expression. */
function sel(selector: string): string {
	return JSON.stringify(selector);
}

/**
 * Evaluate a JS expression string in the page. rustwright's `evaluate` calls the
 * string as a function, so we wrap the expression in an arrow that returns it, to
 * match Playwright's string-as-expression semantics that the DSL relies on.
 */
function evalExpr(page: RwNativePage, expression: string): Promise<unknown> {
	return page.evaluate(`() => (${expression})`);
}

/** Build a CSS attribute selector, exact or substring. */
function attr(name: string, value: string, exact?: boolean): string {
	const v = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `[${name}${exact ? '' : '*'}="${v}"]`;
}

/**
 * Poll a check until it returns true or the timeout elapses.
 * @param check - returns true when the condition is met.
 * @param timeout - milliseconds before giving up (default 5000).
 * @returns whether the check passed before the timeout.
 */
async function poll(check: () => Promise<boolean>, timeout = 5000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	for (;;) {
		if (await check()) return true;
		if (Date.now() >= deadline) return false;
		await sleep(100);
	}
}

/** A DSL locator backed by a CSS selector string driven through rustwright. */
class RwLocator implements StepLocator {
	constructor(
		private readonly page: RwNativePage,
		readonly selector: string,
		private readonly why?: string,
	) {}

	private ensure(): void {
		if (this.why) throw new EngineUnsupportedError(this.why);
	}

	async click(): Promise<void> {
		this.ensure();
		await this.page.click(this.selector);
	}
	async fill(value: string): Promise<void> {
		this.ensure();
		await this.page.fill(this.selector, value);
	}
	async textContent(): Promise<string | null> {
		this.ensure();
		return this.page.textContent(this.selector);
	}
	async count(): Promise<number> {
		this.ensure();
		return Number(await evalExpr(this.page, `document.querySelectorAll(${sel(this.selector)}).length`));
	}
	/** Visibility of the first matching element, for retrying assertions. */
	async visibilityState(): Promise<'missing' | 'hidden' | 'visible'> {
		this.ensure();
		return visibility(this.page, this.selector);
	}
	async waitFor(opts?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }): Promise<void> {
		this.ensure();
		const state = opts?.state ?? 'visible';
		const ok = await poll(async () => {
			const s = await visibility(this.page, this.selector);
			if (state === 'attached') return s !== 'missing';
			if (state === 'detached') return s === 'missing';
			if (state === 'hidden') return s !== 'visible';
			return s === 'visible';
		}, opts?.timeout);
		if (!ok) throw new Error(`Timed out waiting for ${this.selector} to be ${state}`);
	}

	dblclick(): Promise<void> {
		throw new EngineUnsupportedError('double-click');
	}
	press(): Promise<void> {
		throw new EngineUnsupportedError('pressing a key on an element');
	}
	hover(): Promise<void> {
		throw new EngineUnsupportedError('hover');
	}
	selectOption(): Promise<unknown> {
		throw new EngineUnsupportedError('choosing from a dropdown');
	}
	screenshot(): Promise<Buffer> {
		throw new EngineUnsupportedError('element screenshots (used by visual checks)');
	}
	dragTo(): Promise<void> {
		throw new EngineUnsupportedError('drag and drop');
	}
	scrollIntoViewIfNeeded(): Promise<void> {
		throw new EngineUnsupportedError('scrolling to an element');
	}
	setInputFiles(): Promise<void> {
		throw new EngineUnsupportedError('file uploads');
	}
	nth(): StepLocator {
		return new RwLocator(this.page, this.selector, 'the which-one (nth) selector');
	}
}

/** Report the visibility of the first element matching a selector. */
async function visibility(page: RwNativePage, selector: string): Promise<'missing' | 'hidden' | 'visible'> {
	const expr = `(() => { const el = document.querySelector(${sel(selector)}); if (!el) return 'missing'; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return (s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0) ? 'visible' : 'hidden'; })()`;
	return (await evalExpr(page, expr)) as 'missing' | 'hidden' | 'visible';
}

/** A DSL page backed by rustwright. */
class RwPage implements StepPage {
	private currentUrl = 'about:blank';
	readonly keyboard = {
		press: async (): Promise<void> => {
			throw new EngineUnsupportedError('pressing a key');
		},
	};

	constructor(private readonly page: RwNativePage) {}

	private unsupported(feature: string): StepLocator {
		return new RwLocator(this.page, '', feature);
	}
	private css(selector: string): StepLocator {
		return new RwLocator(this.page, selector);
	}

	async goto(url: string, opts?: unknown): Promise<unknown> {
		const waitUntil = (opts as { waitUntil?: string } | undefined)?.waitUntil as 'load' | 'domcontentloaded' | 'networkidle' | 'commit' | undefined;
		await this.page.goto(url, waitUntil ? { waitUntil } : undefined);
		this.currentUrl = await this.currentHref();
		return null;
	}

	/** The live current URL. rustwright has no `page.url()`, so read it from the page. */
	async currentHref(): Promise<string> {
		return String(await evalExpr(this.page, 'location.href'));
	}

	getByRole(role: string, opts?: { name?: string }): StepLocator {
		// CSS cannot express accessible names or implicit ARIA roles reliably.
		return this.unsupported(opts?.name ? `finding the "${opts.name}" ${role} by role` : `finding elements by the ${role} role`);
	}
	getByText(): StepLocator {
		return this.unsupported('finding elements by visible text');
	}
	getByLabel(): StepLocator {
		return this.unsupported('finding fields by their label');
	}
	getByPlaceholder(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.css(attr('placeholder', text, opts?.exact));
	}
	getByTestId(testId: string): StepLocator {
		return this.css(attr('data-testid', testId, true));
	}
	getByAltText(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.css(attr('alt', text, opts?.exact));
	}
	getByTitle(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.css(attr('title', text, opts?.exact));
	}
	locator(selector: string): StepLocator {
		if (selector.startsWith('xpath=')) return this.unsupported('XPath selectors');
		if (selector.startsWith('aria-ref=')) return this.unsupported('aria-ref selectors (used by the AI step and self-healing)');
		return this.css(selector);
	}

	async waitForTimeout(ms: number): Promise<void> {
		await sleep(ms);
	}
	async waitForURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void> {
		const ok = await poll(async () => matchUrl(String(await evalExpr(this.page, "location.href")), url), opts?.timeout);
		if (!ok) throw new Error(`Timed out waiting for URL to match ${String(url)}`);
	}
	async waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void> {
		// goto already waits for load / domcontentloaded; approximate networkidle with a short settle.
		if (state === 'networkidle') await sleep(500);
	}
	async screenshot(opts?: unknown): Promise<Buffer> {
		return this.page.screenshot(opts as { fullPage?: boolean; type?: 'png' | 'jpeg' | 'webp' } | undefined);
	}
	url(): string {
		return this.currentUrl;
	}
	goBack(): Promise<unknown> {
		throw new EngineUnsupportedError('going back');
	}
	async reload(): Promise<unknown> {
		await this.page.goto(this.currentUrl);
		return null;
	}
	async evaluate(expression: string): Promise<unknown> {
		return evalExpr(this.page, expression);
	}
}

/** Whether a URL string matches an expected string (substring) or RegExp. */
function matchUrl(actual: string, expected: string | RegExp): boolean {
	return typeof expected === 'string' ? actual.includes(expected) : expected.test(actual);
}

/** Build a retrying `expect`, matching Playwright's auto-waiting matchers over the supported subset. */
function makeExpect(): StepExpect {
	const build = (t: StepLocator | StepPage, negate: boolean): StepAssertion => {
		const loc = t instanceof RwLocator ? t : undefined;
		const page = t instanceof RwPage ? t : undefined;

		async function check(fn: () => Promise<boolean>, message: string): Promise<void> {
			const ok = await poll(async () => (negate ? !(await fn()) : await fn()));
			if (!ok) throw new Error(`${message}${negate ? ' (expected not to)' : ''}`);
		}
		const onLoc = <T>(fn: (l: RwLocator) => Promise<T>): (() => Promise<T>) => {
			return () => (loc ? fn(loc) : Promise.reject(new Error('assertion target is not an element')));
		};

		const base: StepAssertion = {
			toBeVisible: () => check(onLoc(async (l) => (await l.visibilityState()) === 'visible'), `expected ${loc?.selector} to be visible`),
			toBeAttached: () => check(onLoc(async (l) => (await l.visibilityState()) !== 'missing'), `expected ${loc?.selector} to be attached`),
			toBeHidden: () => check(onLoc(async (l) => (await l.visibilityState()) !== 'visible'), `expected ${loc?.selector} to be hidden`),
			toHaveText: (expected) => check(onLoc(async (l) => textMatches(await l.textContent(), expected, true)), `expected ${loc?.selector} to have text ${String(expected)}`),
			toContainText: (expected) => check(onLoc(async (l) => textMatches(await l.textContent(), expected, false)), `expected ${loc?.selector} to contain text ${String(expected)}`),
			toHaveCount: (count) => check(onLoc(async (l) => (await l.count()) === count), `expected ${loc?.selector} to have count ${count}`),
			toHaveURL: (expected) => check(async () => matchUrl(page ? await page.currentHref() : '', expected), `expected URL to match ${String(expected)}`),
			not: undefined as unknown as StepAssertion['not'],
		};
		if (!negate) base.not = build(t, true);
		return base;
	};
	return (t) => build(t, false);
}

/** Compare text content against an expected string (or RegExp), exact or substring. */
function textMatches(actual: string | null, expected: string | RegExp, exact: boolean): boolean {
	const text = (actual ?? '').trim();
	if (expected instanceof RegExp) return expected.test(text);
	return exact ? text === expected : text.includes(expected);
}

export interface RustwrightSession {
	page: StepPage;
	expect: StepExpect;
	/** Take a full-page or viewport screenshot as PNG. */
	screenshot(fullPage?: boolean): Promise<Buffer>;
	close(): Promise<void>;
}

/**
 * Launch a rustwright Chromium session and return the DSL-shaped page and expect.
 * @param opts.headless - run headless (default true).
 * @returns a session with the StepPage, a retrying expect, screenshot, and close.
 * @example const s = await launchRustwright(); await s.page.goto('https://example.org');
 */
export async function launchRustwright(opts: { headless?: boolean } = {}): Promise<RustwrightSession> {
	const browser: RwBrowser = await chromium.launch({ headless: opts.headless ?? true });
	const native = await browser.newPage();
	const page = new RwPage(native);
	return {
		page,
		expect: makeExpect(),
		screenshot: (fullPage) => native.screenshot({ type: 'png', fullPage: Boolean(fullPage) }),
		close: () => browser.close(),
	};
}
