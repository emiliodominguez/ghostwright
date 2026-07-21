/**
 * Structural interfaces for the subset of Playwright's Page / Locator / expect
 * that compiled steps use. Keeping these local means `@ghostwright/dsl` has no
 * dependency on Playwright — the worker passes real Playwright objects (which are
 * structurally compatible) and the browser-side code editor imports the same
 * schema without pulling a browser engine into the bundle.
 */

export interface StepLocator {
	click(opts?: unknown): Promise<void>;
	dblclick(opts?: unknown): Promise<void>;
	fill(value: string): Promise<void>;
	press(key: string): Promise<void>;
	hover(): Promise<void>;
	selectOption(values: string | string[]): Promise<unknown>;
	waitFor(opts?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }): Promise<void>;
	screenshot(opts?: unknown): Promise<Buffer>;
	textContent(): Promise<string | null>;
	dragTo(target: StepLocator): Promise<void>;
	scrollIntoViewIfNeeded(): Promise<void>;
}

export interface StepPage {
	goto(url: string, opts?: unknown): Promise<unknown>;
	getByRole(role: string, opts?: { name?: string }): StepLocator;
	locator(selector: string): StepLocator;
	waitForTimeout(ms: number): Promise<void>;
	screenshot(opts?: unknown): Promise<Buffer>;
	url(): string;
	keyboard: { press(key: string): Promise<void> };
	goBack(opts?: unknown): Promise<unknown>;
	reload(opts?: unknown): Promise<unknown>;
	/** Evaluate a JS expression string in the page context (Playwright's `page.evaluate`). */
	evaluate(expression: string): Promise<unknown>;
}

/** The negatable subset of assertions (Playwright's `expect(...).not`). */
export interface NegatableAssertion {
	toBeVisible(): Promise<void>;
	toBeAttached(): Promise<void>;
	toHaveText(expected: string | RegExp): Promise<void>;
	toContainText(expected: string): Promise<void>;
}

export interface StepAssertion extends NegatableAssertion {
	toBeHidden(): Promise<void>;
	toHaveURL(expected: string | RegExp): Promise<void>;
	toHaveCount(count: number): Promise<void>;
	/** Negated matchers (Playwright's `.not`). */
	not: NegatableAssertion;
}

export type StepExpect = (target: StepLocator | StepPage) => StepAssertion;

/** Resolver for `aiStep` — provided by the worker (T9), absent in pure contexts. */
export type AiResolver = (instruction: string, page: StepPage) => Promise<StepLocator>;

/** Sink for `visualCheck` screenshots — provided by the worker (T7). */
export type VisualSink = (name: string, image: Buffer, opts: { fullPage: boolean; ignoreRegions?: IgnoreRegion[] }) => Promise<void>;

export interface IgnoreRegion {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface RunContext {
	/** Web-first retrying assertion factory (Playwright's `expect` in production). */
	expect: StepExpect;
	baseUrl?: string;
	ai?: AiResolver;
	onVisualCheck?: VisualSink;
	/** Resolve a named secret to a current TOTP code (worker only). */
	totp?: (secret: string) => Promise<string>;
	/** Mutable per-run variable store; `setVar`/`extract` steps write here. */
	vars?: Record<string, string>;
	/** Fallback resolver for built-in/generated vars ({{timestamp}}, faker) — worker only. */
	resolveVar?: (key: string) => string | undefined;
}
