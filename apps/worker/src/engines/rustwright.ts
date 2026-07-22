import type { StepAssertion, StepExpect, StepLocator, StepPage } from '@ghostwright/dsl';
import { chromium, type Browser as RwBrowser, type Page as RwNativePage } from 'rustwright';

/**
 * Experimental browser engine backed by rustwright (a Rust CDP core with a
 * Playwright-shaped Node binding). It is opt-in and Chromium-only.
 *
 * rustwright's Node binding is selector-string based and small: goto, click,
 * fill, textContent, evaluate, screenshot. Its selector engine resolves CSS,
 * XPath and Playwright's `text=` engine, so this adapter supports targeting by
 * CSS, XPath, visible text, field label (via XPath), test id, placeholder, alt
 * text and title, plus custom-code steps. It has no locator objects, no role=
 * engine, no browser contexts, and therefore no tracing, video, HAR,
 * storageState, or multi-browser support. Anything that needs the Playwright
 * engine (role/accessible-name targeting, hover/press/select/drag/upload, the
 * AI step, and the engine-level features above) throws a clear error, so an
 * unsupported test fails fast with a useful message instead of behaving oddly.
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

/** Escape a value for embedding inside a double-quoted CSS string, including control chars. */
function cssString(value: string): string {
	return value.replace(/[\\"]/g, '\\$&').replace(/[\x00-\x1f\x7f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
}

/** Build a CSS attribute selector, exact or substring. */
function attr(name: string, value: string, exact?: boolean): string {
	return `[${name}${exact ? '' : '*'}="${cssString(value)}"]`;
}

/** Whether a selector is an XPath (rustwright accepts both bare `//...` and `xpath=...`). */
function isXpath(selector: string): boolean {
	return selector.startsWith('xpath=') || selector.startsWith('//') || selector.startsWith('(//');
}

/** The bare XPath body without the `xpath=` prefix. */
function xpathBody(selector: string): string {
	return selector.startsWith('xpath=') ? selector.slice(6) : selector;
}

/** JS expression resolving the first element for a selector (CSS or XPath), or null. */
function resolveExpr(selector: string): string {
	if (isXpath(selector)) return `document.evaluate(${sel(xpathBody(selector))}, document, null, 9, null).singleNodeValue`;
	return `document.querySelector(${sel(selector)})`;
}

/** JS expression counting elements matching a selector (CSS or XPath). */
function countExpr(selector: string): string {
	if (isXpath(selector)) return `document.evaluate(${sel(xpathBody(selector))}, document, null, 7, null).snapshotLength`;
	return `document.querySelectorAll(${sel(selector)}).length`;
}

/** Quote a string as an XPath literal, using concat() when it contains a double quote. */
function xpathLiteral(s: string): string {
	if (!s.includes('"')) return `"${s}"`;
	return `concat(${s.split('"').map((p) => `"${p}"`).join(`, '"', `)})`;
}

/** XPath for the innermost element whose text contains (or exactly equals) the given string. */
function textXpath(text: string, exact?: boolean): string {
	const lit = xpathLiteral(text);
	const cond = exact ? `normalize-space(.)=${lit}` : `contains(normalize-space(.), ${lit})`;
	return `xpath=//*[${cond} and not(.//*[${cond}])]`;
}

/** XPath for a control associated with a label (label[for], a wrapping label, or aria-label). */
function labelXpath(text: string, exact?: boolean): string {
	const lit = xpathLiteral(text);
	const m = exact ? `normalize-space(.)=${lit}` : `contains(normalize-space(.), ${lit})`;
	const aria = exact ? `@aria-label=${lit}` : `contains(@aria-label, ${lit})`;
	const controls = ['input', 'textarea', 'select'];
	const byFor = controls.map((c) => `//${c}[@id=//label[${m}]/@for]`);
	const wrapping = controls.map((c) => `//label[${m}]//${c}`);
	return `xpath=${[...byFor, ...wrapping, `//*[${aria}]`].join(' | ')}`;
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
		private readonly timeout: number,
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
		return Number(await evalExpr(this.page, countExpr(this.selector)));
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
		}, opts?.timeout ?? this.timeout);
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
		return new RwLocator(this.page, this.selector, this.timeout, 'the which-one (nth) selector');
	}
}

/** Report the visibility of the first element matching a selector (CSS or XPath). */
async function visibility(page: RwNativePage, selector: string): Promise<'missing' | 'hidden' | 'visible'> {
	// Matches Playwright's notion of visibility: laid-out box, not display:none / visibility:hidden.
	// Opacity is deliberately ignored (a fully transparent but laid-out element is "visible").
	const expr = `(() => { const el = ${resolveExpr(selector)}; if (!el) return 'missing'; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return (s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0) ? 'visible' : 'hidden'; })()`;
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

	constructor(
		private readonly page: RwNativePage,
		private readonly timeout: number,
	) {}

	private unsupported(feature: string): StepLocator {
		return new RwLocator(this.page, '', this.timeout, feature);
	}
	private at(selector: string): StepLocator {
		return new RwLocator(this.page, selector, this.timeout);
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
		// rustwright's selector engine has no role= support and CSS cannot express implicit
		// ARIA roles or accessible names.
		return this.unsupported(opts?.name ? `finding the "${opts.name}" ${role} by role` : `finding elements by the ${role} role`);
	}
	getByText(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.at(textXpath(text, opts?.exact));
	}
	getByLabel(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.at(labelXpath(text, opts?.exact));
	}
	getByPlaceholder(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.at(attr('placeholder', text, opts?.exact));
	}
	getByTestId(testId: string): StepLocator {
		return this.at(attr('data-testid', testId, true));
	}
	getByAltText(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.at(attr('alt', text, opts?.exact));
	}
	getByTitle(text: string, opts?: { exact?: boolean }): StepLocator {
		return this.at(attr('title', text, opts?.exact));
	}
	locator(selector: string): StepLocator {
		if (selector.startsWith('aria-ref=')) return this.unsupported('aria-ref selectors (used by the AI step and self-healing)');
		// Convert Playwright's `text=` engine to XPath so actions and assertions resolve it the
		// same way (rustwright's native click/fill accept `text=`, but count/visibility go through
		// document.evaluate, which does not). Quoted text is an exact match, unquoted a substring.
		if (selector.startsWith('text=')) {
			const raw = selector.slice(5).trim();
			const quoted = raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
			return this.at(textXpath(quoted ? raw.slice(1, -1) : raw, quoted));
		}
		// Both CSS and `xpath=...` resolve natively.
		return this.at(selector);
	}

	async waitForTimeout(ms: number): Promise<void> {
		await sleep(ms);
	}
	async waitForURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void> {
		const ok = await poll(async () => matchUrlGlob(String(await evalExpr(this.page, 'location.href')), url), opts?.timeout ?? this.timeout);
		if (!ok) throw new Error(`Timed out waiting for URL to match ${String(url)}`);
		this.currentUrl = await this.currentHref();
	}
	async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'load'): Promise<void> {
		// networkidle has no CDP equivalent here; approximate with a short settle.
		if (state === 'networkidle') {
			await sleep(500);
			return;
		}
		// Poll document.readyState to the target: 'interactive' for DOMContentLoaded, 'complete' for load.
		const reached = (rs: string): boolean => (state === 'domcontentloaded' ? rs === 'interactive' || rs === 'complete' : rs === 'complete');
		const ok = await poll(async () => reached(String(await evalExpr(this.page, 'document.readyState'))), this.timeout);
		if (!ok) throw new Error(`Timed out waiting for load state ${state}`);
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
		// rustwright has no reload primitive; re-navigate to the live URL (not the stale cached one).
		await this.page.goto(await this.currentHref());
		this.currentUrl = await this.currentHref();
		return null;
	}
	async evaluate(expression: string): Promise<unknown> {
		return evalExpr(this.page, expression);
	}
}

/**
 * Whether a URL matches an assertion target. The DSL passes a string only when it wants an
 * exact full-URL match, and a RegExp for a substring match (see the compiler's assertUrl), so
 * a string is compared with equality here, never `includes`.
 */
function matchUrlExact(actual: string, expected: string | RegExp): boolean {
	return typeof expected === 'string' ? actual === expected : expected.test(actual);
}

/** Convert a Playwright-style URL glob (`*` within a path segment, `**` across segments) to a RegExp. */
function urlGlobToRegExp(glob: string): RegExp {
	let re = '';
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i]!;
		if (c === '*') {
			if (glob[i + 1] === '*') {
				re += '.*';
				i++;
			} else {
				re += '[^/]*';
			}
		} else {
			re += c.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
		}
	}
	return new RegExp(`^${re}$`);
}

/** Whether a URL matches a `waitForURL` target: a RegExp (substring) or a glob string (Playwright semantics). */
function matchUrlGlob(actual: string, expected: string | RegExp): boolean {
	return expected instanceof RegExp ? expected.test(actual) : urlGlobToRegExp(expected).test(actual);
}

/** Build a retrying `expect`, matching Playwright's auto-waiting matchers over the supported subset. */
function makeExpect(timeout: number): StepExpect {
	const build = (t: StepLocator | StepPage, negate: boolean): StepAssertion => {
		const loc = t instanceof RwLocator ? t : undefined;
		const page = t instanceof RwPage ? t : undefined;

		async function check(fn: () => Promise<boolean>, message: string): Promise<void> {
			const ok = await poll(async () => (negate ? !(await fn()) : await fn()), timeout);
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
			toHaveURL: (expected) => check(async () => matchUrlExact(page ? await page.currentHref() : '', expected), `expected URL to match ${String(expected)}`),
			not: undefined as unknown as StepAssertion['not'],
		};
		if (!negate) base.not = build(t, true);
		return base;
	};
	return (t) => build(t, false);
}

/** Collapse runs of whitespace and trim, as Playwright does before comparing text. */
function normalizeText(s: string): string {
	return s.replace(/\s+/g, ' ').trim();
}

/** Compare text content against an expected string (or RegExp), exact or substring. */
function textMatches(actual: string | null, expected: string | RegExp, exact: boolean): boolean {
	const text = normalizeText(actual ?? '');
	if (expected instanceof RegExp) return expected.test(text);
	const want = normalizeText(expected);
	return exact ? text === want : text.includes(want);
}

export interface RustwrightSession {
	page: StepPage;
	expect: StepExpect;
	/** The live current URL, read from the page rather than a cached value, for the run's finalUrl. */
	currentUrl(): Promise<string>;
	close(): Promise<void>;
}

/** Default poll timeout for waits and assertions when the test does not set one, matching Playwright's 5s. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Launch a rustwright Chromium session and return the DSL-shaped page and expect.
 * @param opts.headless - run headless (default true).
 * @param opts.defaultTimeout - default timeout in ms for waits and assertions (default 5000).
 * @returns a session with the StepPage, a retrying expect, a live currentUrl, and close.
 * @example const s = await launchRustwright(); await s.page.goto('https://example.org');
 */
export async function launchRustwright(opts: { headless?: boolean; defaultTimeout?: number } = {}): Promise<RustwrightSession> {
	const timeout = opts.defaultTimeout ?? DEFAULT_TIMEOUT_MS;
	const browser: RwBrowser = await chromium.launch({ headless: opts.headless ?? true });
	const native = await browser.newPage();
	const page = new RwPage(native, timeout);
	return {
		page,
		expect: makeExpect(timeout),
		currentUrl: () => page.currentHref(),
		close: () => browser.close(),
	};
}
