import { interpolate, type VarLookup } from './interp';
import type { Locator, Step, StepType } from './schema';
import type { RunContext, StepLocator, StepPage } from './runtime';

export interface CompiledStep {
	type: StepType;
	run(page: StepPage, ctx: RunContext): Promise<void>;
	/** When present, the step runs only if this resolves truthy; otherwise it's skipped. */
	shouldRun?(page: StepPage, ctx: RunContext): Promise<boolean>;
}

/** Thrown by an `exit` step to end the run early; `pass` sets the verdict. */
export class ExitTest extends Error {
	constructor(public readonly pass: boolean) {
		super('exit');
		this.name = 'ExitTest';
	}
}

/** Build a variable lookup from a run context (user-set vars + built-in fallback). */
function lookup(ctx: RunContext): VarLookup {
	return (key) => (ctx.resolveVar ? ctx.resolveVar(key) : ctx.vars?.[key]);
}
/** Interpolate `{{var}}` tokens in a string against the run context. */
function iv(str: string, ctx: RunContext): string {
	return interpolate(str, lookup(ctx));
}
/** Interpolate a locator's name/css so elements can be targeted with variables. */
function interpLoc(loc: Locator, ctx: RunContext): Locator {
	return {
		...loc,
		...(loc.name !== undefined ? { name: iv(loc.name, ctx) } : {}),
		...(loc.css !== undefined ? { css: iv(loc.css, ctx) } : {}),
	};
}

/**
 * Resolve a DSL locator to a Playwright locator. Priority: durable `role`(+`name`)
 * first, then `css`, then `ref` (the `aria-ref` engine used by AI snapshots).
 *
 * @param page - the page to resolve against.
 * @param loc - the DSL locator.
 * @returns a Playwright-compatible locator.
 */
export function resolveLocator(page: StepPage, loc: Locator): StepLocator {
	if (loc.role) {
		return page.getByRole(loc.role, loc.name !== undefined ? { name: loc.name } : undefined);
	}
	if (loc.css) {
		return page.locator(loc.css);
	}
	// `ref` fallback — Playwright's aria-ref engine (as used by _snapshotForAI).
	return page.locator(`aria-ref=${loc.ref}`);
}

/** Every locator strategy present, in durability order (role+name → css → ref). */
function candidates(page: StepPage, loc: Locator): StepLocator[] {
	const out: StepLocator[] = [];
	if (loc.role) out.push(page.getByRole(loc.role, loc.name !== undefined ? { name: loc.name } : undefined));
	if (loc.css) out.push(page.locator(loc.css));
	if (loc.ref) out.push(page.locator(`aria-ref=${loc.ref}`));
	return out;
}

/**
 * Self-healing locator resolution for actions: when a locator carries more than one
 * strategy, pick the first that currently matches an element (a backup-selector probe,
 * like GI's backup selectors). Falls back to the durable primary so it still auto-waits.
 *
 * @param page - the page to resolve against.
 * @param loc - the DSL locator.
 * @returns the healed Playwright locator.
 */
export async function healLocator(page: StepPage, loc: Locator): Promise<StepLocator> {
	const list = candidates(page, loc);
	if (list.length <= 1) return list[0] ?? resolveLocator(page, loc);
	for (const c of list) {
		try {
			if ((await c.count()) > 0) return c;
		} catch {
			// a malformed strategy shouldn't kill the step — try the next one
		}
	}
	return list[0]!;
}

/**
 * Compile a single DSL step into an executable runner. The runner is engine-agnostic:
 * it calls the structural `StepPage`/`StepLocator`/`expect` passed at run time, so the
 * same compiler powers both the worker (real Playwright) and unit tests (fakes).
 *
 * @param step - a validated DSL step.
 * @returns a compiled step whose `run(page, ctx)` performs the action/assertion.
 */
export function compile(step: Step): CompiledStep {
	const compiled = buildRunner(step);
	if (step.condition !== undefined) {
		const cond = step.condition;
		compiled.shouldRun = async (page, ctx) => Boolean(await page.evaluate(wrapJs(iv(cond, ctx))));
	}
	return compiled;
}

function buildRunner(step: Step): CompiledStep {
	switch (step.type) {
		case 'goto':
			return { type: step.type, run: async (page, ctx) => void (await page.goto(absolute(iv(step.url, ctx), ctx))) };
		case 'click':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const l = await healLocator(page, interpLoc(step.locator, ctx));
					if (step.double) await l.dblclick();
					else await l.click(step.button ? { button: step.button } : undefined);
				},
			};
		case 'fill':
			return { type: step.type, run: async (page, ctx) => (await healLocator(page, interpLoc(step.locator, ctx))).fill(iv(step.value, ctx)) };
		case 'press':
			return {
				type: step.type,
				run: async (page, ctx) =>
					step.locator ? resolveLocator(page, interpLoc(step.locator, ctx)).press(step.key) : page.keyboard.press(step.key),
			};
		case 'hover':
			return { type: step.type, run: async (page, ctx) => (await healLocator(page, interpLoc(step.locator, ctx))).hover() };
		case 'select':
			return {
				type: step.type,
				run: async (page, ctx) => void (await (await healLocator(page, interpLoc(step.locator, ctx))).selectOption(step.values.map((v) => iv(v, ctx)))),
			};
		case 'wait':
			return {
				type: step.type,
				run: async (page, ctx) => {
					if (step.locator) {
						await resolveLocator(page, interpLoc(step.locator, ctx)).waitFor({
							state: step.state,
							timeout: step.timeoutMs,
						});
					} else {
						await page.waitForTimeout(step.timeoutMs ?? 1000);
					}
				},
			};
		case 'assertText':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const loc = resolveLocator(page, interpLoc(step.locator, ctx));
					if (step.mode === 'exact') await ctx.expect(loc).toHaveText(iv(step.text, ctx));
					else await ctx.expect(loc).toContainText(iv(step.text, ctx));
				},
			};
		case 'assertVisible':
			return { type: step.type, run: async (page, ctx) => ctx.expect(resolveLocator(page, interpLoc(step.locator, ctx))).toBeVisible() };
		case 'assertNotVisible':
			return { type: step.type, run: async (page, ctx) => ctx.expect(resolveLocator(page, interpLoc(step.locator, ctx))).toBeHidden() };
		case 'assertPresent':
			return { type: step.type, run: async (page, ctx) => ctx.expect(resolveLocator(page, interpLoc(step.locator, ctx))).toBeAttached() };
		case 'assertNotPresent':
			return { type: step.type, run: async (page, ctx) => ctx.expect(resolveLocator(page, interpLoc(step.locator, ctx))).not.toBeAttached() };
		case 'assertNotText':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const loc = resolveLocator(page, interpLoc(step.locator, ctx));
					if (step.mode === 'exact') await ctx.expect(loc).not.toHaveText(iv(step.text, ctx));
					else await ctx.expect(loc).not.toContainText(iv(step.text, ctx));
				},
			};
		case 'dragAndDrop':
			return {
				type: step.type,
				run: async (page, ctx) => (await healLocator(page, interpLoc(step.from, ctx))).dragTo(await healLocator(page, interpLoc(step.to, ctx))),
			};
		case 'scroll':
			return {
				type: step.type,
				run: async (page, ctx) => {
					if (step.locator) await resolveLocator(page, interpLoc(step.locator, ctx)).scrollIntoViewIfNeeded();
					else await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
				},
			};
		case 'back':
			return { type: step.type, run: async (page) => void (await page.goBack()) };
		case 'refresh':
			return { type: step.type, run: async (page) => void (await page.reload()) };
		case 'upload':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const refs = step.files.map((f) => iv(f, ctx));
					const paths = ctx.resolveFile ? await Promise.all(refs.map((r) => ctx.resolveFile!(r))) : refs;
					await (await healLocator(page, interpLoc(step.locator, ctx))).setInputFiles(paths);
				},
			};
		case 'extract':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const text = await (await healLocator(page, interpLoc(step.locator, ctx))).textContent();
					(ctx.vars ??= {})[step.name] = text ?? '';
				},
			};
		case 'extractJs':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const result = await page.evaluate(wrapJs(iv(step.code, ctx)));
					(ctx.vars ??= {})[step.name] = result == null ? '' : String(result);
				},
			};
		case 'exit':
			return {
				type: step.type,
				run: async () => {
					throw new ExitTest(step.pass);
				},
			};
		case 'actionRef':
			return {
				type: step.type,
				run: async () => {
					throw new Error('actionRef must be expanded (via expandActions) before running');
				},
			};
		case 'assertUrl':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const target = absolute(iv(step.url, ctx), ctx);
					await ctx.expect(page).toHaveURL(step.exact ? target : new RegExp(escapeRegExp(target)));
				},
			};
		case 'screenshot':
			return { type: step.type, run: async (page) => void (await page.screenshot({ fullPage: step.fullPage })) };
		case 'visualCheck':
			return {
				type: step.type,
				run: async (page, ctx) => {
					// Hide dynamic elements before capture so they don't cause false diffs.
					if (step.exclude?.length) {
						await page.evaluate(
							`(${JSON.stringify(step.exclude)}).forEach((s) => document.querySelectorAll(s).forEach((el) => (el.style.visibility = 'hidden')))`,
						);
					}
					const image = step.selector
						? await page.locator(step.selector).screenshot()
						: await page.screenshot({ fullPage: step.fullPage });
					if (!ctx.onVisualCheck) throw new Error('visualCheck requires a visual sink (worker only)');
					await ctx.onVisualCheck(step.name, image, {
						fullPage: step.fullPage,
						ignoreRegions: step.ignoreRegions,
						tolerancePct: step.tolerancePct,
					});
				},
			};
		case 'aiStep':
			return {
				type: step.type,
				run: async (page, ctx) => {
					if (!ctx.ai) throw new Error('aiStep requires an AI resolver (worker only)');
					const loc = await ctx.ai(iv(step.instruction, ctx), page);
					await loc.click();
				},
			};
		case 'setVar':
			return {
				type: step.type,
				run: async (_page, ctx) => {
					(ctx.vars ??= {})[step.name] = iv(step.value, ctx);
				},
			};
		case 'totp':
			return {
				type: step.type,
				run: async (page, ctx) => {
					if (!ctx.totp) throw new Error('totp requires a secret resolver (worker only)');
					const code = await ctx.totp(step.secret);
					await (await healLocator(page, interpLoc(step.locator, ctx))).fill(code);
				},
			};
		case 'execJs':
			return { type: step.type, run: async (page, ctx) => void (await page.evaluate(wrapJs(iv(step.code, ctx)))) };
		case 'assertJs':
			return {
				type: step.type,
				run: async (page, ctx) => {
					const result = await page.evaluate(wrapJs(iv(step.code, ctx)));
					if (!result) throw new Error('assertJs: the code returned a falsy value');
				},
			};
	}
}

/** Wrap user code in an async IIFE so `return` and `await` work, evaluated in the page sandbox. */
function wrapJs(code: string): string {
	return `(async () => { ${code} })()`;
}

function absolute(url: string, ctx: RunContext): string {
	if (!ctx.baseUrl || /^[a-z]+:\/\//i.test(url)) return url;
	return new URL(url, ctx.baseUrl).toString();
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
