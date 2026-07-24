import { z } from 'zod';

/**
 * An element locator. Any one of the strategy fields targets an element the way
 * Playwright does — by accessible role+name, visible text, placeholder, label,
 * test id, alt/title, CSS, XPath, or an AI `ref`. `exact` tightens text matching,
 * `nth` disambiguates when several match, and `fallbacks` are backup selectors the
 * self-healing resolver tries in order when the primary finds nothing.
 */
const locatorFields = {
	role: z.string().optional(),
	name: z.string().optional(),
	text: z.string().optional(),
	placeholder: z.string().optional(),
	label: z.string().optional(),
	testId: z.string().optional(),
	altText: z.string().optional(),
	title: z.string().optional(),
	css: z.string().optional(),
	xpath: z.string().optional(),
	ref: z.string().optional(),
	/** Exact (vs. substring/normalized) matching for text-based strategies. */
	exact: z.boolean().optional(),
	/** Pick the Nth match (0-based) when the strategy matches several elements. */
	nth: z.number().int().optional(),
	/**
	 * Resolve this locator inside an iframe rather than the top document. The value
	 * is a CSS selector for the frame element (e.g. `iframe`, or `iframe#app`). Used
	 * for apps that render their UI inside an embedded frame.
	 */
	frame: z.string().optional(),
};

const STRATEGY_KEYS = ['role', 'text', 'placeholder', 'label', 'testId', 'altText', 'title', 'css', 'xpath', 'ref'] as const;
function hasStrategy(l: Record<string, unknown>): boolean {
	return STRATEGY_KEYS.some((k) => l[k] !== undefined && l[k] !== '');
}

const baseLocatorSchema = z.object(locatorFields);

export const locatorSchema = z
	.object({ ...locatorFields, fallbacks: z.array(baseLocatorSchema).optional() })
	.refine(hasStrategy, { message: 'locator needs a way to find the element (role, text, css, …)' });

export type Locator = z.infer<typeof locatorSchema>;

export const ignoreRegionSchema = z.object({
	x1: z.number(),
	y1: z.number(),
	x2: z.number(),
	y2: z.number(),
});

const gotoStep = z.object({ type: z.literal('goto'), url: z.string() });
const clickStep = z.object({
	type: z.literal('click'),
	locator: locatorSchema,
	button: z.enum(['left', 'right', 'middle']).optional(),
	double: z.boolean().optional(),
});
const fillStep = z.object({ type: z.literal('fill'), locator: locatorSchema, value: z.string() });
const pressStep = z.object({ type: z.literal('press'), key: z.string(), locator: locatorSchema.optional() });
const hoverStep = z.object({ type: z.literal('hover'), locator: locatorSchema });
const selectStep = z.object({ type: z.literal('select'), locator: locatorSchema, values: z.array(z.string()).min(1) });
const waitStep = z.object({
	type: z.literal('wait'),
	locator: locatorSchema.optional(),
	state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional(),
	timeoutMs: z.number().int().positive().optional(),
});
const waitForUrlStep = z.object({ type: z.literal('waitForUrl'), url: z.string(), timeoutMs: z.number().int().positive().optional() });
const waitForLoadStateStep = z.object({
	type: z.literal('waitForLoadState'),
	state: z.enum(['load', 'domcontentloaded', 'networkidle']).default('networkidle'),
});
const assertTextStep = z.object({
	type: z.literal('assertText'),
	locator: locatorSchema,
	text: z.string(),
	mode: z.enum(['contains', 'exact']).default('contains'),
});
const assertVisibleStep = z.object({ type: z.literal('assertVisible'), locator: locatorSchema });
const assertNotVisibleStep = z.object({ type: z.literal('assertNotVisible'), locator: locatorSchema });
const assertPresentStep = z.object({ type: z.literal('assertPresent'), locator: locatorSchema });
const assertNotPresentStep = z.object({ type: z.literal('assertNotPresent'), locator: locatorSchema });
const assertNotTextStep = z.object({
	type: z.literal('assertNotText'),
	locator: locatorSchema,
	text: z.string(),
	mode: z.enum(['contains', 'exact']).default('contains'),
});
const assertUrlStep = z.object({ type: z.literal('assertUrl'), url: z.string(), exact: z.boolean().default(false) });
const dragAndDropStep = z.object({ type: z.literal('dragAndDrop'), from: locatorSchema, to: locatorSchema });
const scrollStep = z.object({ type: z.literal('scroll'), locator: locatorSchema.optional() });
const backStep = z.object({ type: z.literal('back') });
const refreshStep = z.object({ type: z.literal('refresh') });
const uploadStep = z.object({ type: z.literal('upload'), locator: locatorSchema, files: z.array(z.string()).min(1) });
const extractStep = z.object({ type: z.literal('extract'), name: z.string().min(1), locator: locatorSchema });
const extractJsStep = z.object({ type: z.literal('extractJs'), name: z.string().min(1), code: z.string() });
const exitStep = z.object({ type: z.literal('exit'), pass: z.boolean().default(true) });
// A live reference to a saved action; expanded to its steps at run time (edits propagate).
const actionRefStep = z.object({ type: z.literal('actionRef'), actionId: z.string(), name: z.string().optional() });
const screenshotStep = z.object({ type: z.literal('screenshot'), name: z.string().optional(), fullPage: z.boolean().default(false) });
const visualCheckStep = z.object({
	type: z.literal('visualCheck'),
	name: z.string(),
	fullPage: z.boolean().default(false),
	ignoreRegions: z.array(ignoreRegionSchema).optional(),
	/** Allowed % of changed pixels before the check fails (0–90). */
	tolerancePct: z.number().min(0).max(90).optional(),
	/** CSS selectors hidden before capture (dynamic content). */
	exclude: z.array(z.string()).optional(),
	/** Capture just this element instead of the page. */
	selector: z.string().optional(),
});
const aiStep = z.object({ type: z.literal('aiStep'), instruction: z.string() });
const totpStep = z.object({ type: z.literal('totp'), locator: locatorSchema, secret: z.string() });
// Set a variable to a (possibly interpolated) value, usable in later steps as {{name}}.
const setVarStep = z.object({ type: z.literal('setVar'), name: z.string().min(1), value: z.string() });
// Developer escape hatch: arbitrary JS run in the page context (GI's `execute`).
const execJsStep = z.object({ type: z.literal('execJs'), code: z.string() });
// JS assertion: the code must `return` a value; truthy passes, falsy fails (GI's `assertEval`).
const assertJsStep = z.object({ type: z.literal('assertJs'), code: z.string() });

const stepVariants = z.discriminatedUnion('type', [
	gotoStep,
	clickStep,
	fillStep,
	pressStep,
	hoverStep,
	selectStep,
	waitStep,
	waitForUrlStep,
	waitForLoadStateStep,
	assertTextStep,
	assertVisibleStep,
	assertNotVisibleStep,
	assertPresentStep,
	assertNotPresentStep,
	assertNotTextStep,
	assertUrlStep,
	dragAndDropStep,
	scrollStep,
	backStep,
	refreshStep,
	uploadStep,
	extractStep,
	extractJsStep,
	exitStep,
	actionRefStep,
	screenshotStep,
	visualCheckStep,
	aiStep,
	totpStep,
	setVarStep,
	execJsStep,
	assertJsStep,
]);

// A step is any variant, optionally gated by a JS/`{{var}}` condition (skipped when falsy),
// with optional per-step retry that overrides the test's default step-retry setting.
export const stepSchema = stepVariants.and(
	z.object({
		condition: z.string().optional(),
		/** Extra attempts for this step if it throws (0 = no retry). Overrides the test default. */
		retries: z.number().int().nonnegative().optional(),
		/** Delay (ms) between this step's retry attempts. Overrides the test default. */
		retryDelayMs: z.number().int().nonnegative().optional(),
	}),
);

export type Step = z.infer<typeof stepSchema>;
export type StepType = Step['type'];

export const testSchema = z.object({
	steps: z.array(stepSchema),
});

export type Test = z.infer<typeof testSchema>;

/** Parse+validate an unknown value (e.g. JSON from the editor) into a Test. */
export function parseTest(input: unknown): Test {
	return testSchema.parse(input);
}
