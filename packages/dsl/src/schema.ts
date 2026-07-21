import { z } from 'zod';

/**
 * A durable element locator. `role` + `name` is the primary, self-healing anchor
 * (survives DOM churn); `css` and `ref` are fallbacks. At least one must be present.
 */
export const locatorSchema = z
	.object({
		role: z.string().optional(),
		name: z.string().optional(),
		css: z.string().optional(),
		ref: z.string().optional(),
	})
	.refine((l) => Boolean(l.role || l.css || l.ref), {
		message: 'locator requires at least one of: role, css, ref',
	});

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

// A step is any variant, optionally gated by a JS/`{{var}}` condition (skipped when falsy).
export const stepSchema = stepVariants.and(z.object({ condition: z.string().optional() }));

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
