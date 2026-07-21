import type { Locator, Step, Test } from './schema';
import { testSchema } from './schema';

const BUILDER_KEYS = [
	'goto',
	'click',
	'fill',
	'press',
	'hover',
	'select',
	'wait',
	'assertText',
	'assertVisible',
	'assertUrl',
	'screenshot',
	'visualCheck',
	'ai',
	'totp',
	'setVar',
	'execJs',
	'assertJs',
	'assertNotVisible',
	'assertPresent',
	'assertNotPresent',
	'assertNotText',
	'dragAndDrop',
	'scroll',
	'back',
	'refresh',
	'upload',
	'extract',
	'extractJs',
	'exit',
	'actionRef',
] as const;

function loc(l: Locator): string {
	const parts: string[] = [];
	if (l.role !== undefined) parts.push(`role: ${JSON.stringify(l.role)}`);
	if (l.name !== undefined) parts.push(`name: ${JSON.stringify(l.name)}`);
	if (l.css !== undefined) parts.push(`css: ${JSON.stringify(l.css)}`);
	if (l.ref !== undefined) parts.push(`ref: ${JSON.stringify(l.ref)}`);
	return `{ ${parts.join(', ')} }`;
}

/**
 * Render a DSL test as clean, editable script — one builder call per step.
 * The inverse of {@link fromCode}.
 *
 * @param test - the DSL test.
 * @returns a newline-separated script (bare `goto(...)`, `click(...)`, … calls).
 */
export function toCode(test: Test): string {
	return test.steps.map(stepToLine).join('\n');
}

function stepToLine(s: Step): string {
	switch (s.type) {
		case 'goto':
			return `goto(${JSON.stringify(s.url)})`;
		case 'click':
			return s.button || s.double
				? `click(${loc(s.locator)}, ${JSON.stringify({ ...(s.button ? { button: s.button } : {}), ...(s.double ? { double: true } : {}) })})`
				: `click(${loc(s.locator)})`;
		case 'fill':
			return `fill(${loc(s.locator)}, ${JSON.stringify(s.value)})`;
		case 'press':
			return s.locator ? `press(${JSON.stringify(s.key)}, ${loc(s.locator)})` : `press(${JSON.stringify(s.key)})`;
		case 'hover':
			return `hover(${loc(s.locator)})`;
		case 'select':
			return `select(${loc(s.locator)}, ${JSON.stringify(s.values)})`;
		case 'wait': {
			const o: Record<string, unknown> = {};
			if (s.locator) o.locator = s.locator;
			if (s.state) o.state = s.state;
			if (s.timeoutMs) o.timeoutMs = s.timeoutMs;
			return `wait(${JSON.stringify(o)})`;
		}
		case 'assertText':
			return s.mode === 'exact'
				? `assertText(${loc(s.locator)}, ${JSON.stringify(s.text)}, "exact")`
				: `assertText(${loc(s.locator)}, ${JSON.stringify(s.text)})`;
		case 'assertVisible':
			return `assertVisible(${loc(s.locator)})`;
		case 'assertNotVisible':
			return `assertNotVisible(${loc(s.locator)})`;
		case 'assertPresent':
			return `assertPresent(${loc(s.locator)})`;
		case 'assertNotPresent':
			return `assertNotPresent(${loc(s.locator)})`;
		case 'assertNotText':
			return s.mode === 'exact'
				? `assertNotText(${loc(s.locator)}, ${JSON.stringify(s.text)}, "exact")`
				: `assertNotText(${loc(s.locator)}, ${JSON.stringify(s.text)})`;
		case 'dragAndDrop':
			return `dragAndDrop(${loc(s.from)}, ${loc(s.to)})`;
		case 'scroll':
			return s.locator ? `scroll(${loc(s.locator)})` : `scroll()`;
		case 'back':
			return `back()`;
		case 'refresh':
			return `refresh()`;
		case 'upload':
			return `upload(${loc(s.locator)}, ${JSON.stringify(s.files)})`;
		case 'extract':
			return `extract(${JSON.stringify(s.name)}, ${loc(s.locator)})`;
		case 'extractJs':
			return `extractJs(${JSON.stringify(s.name)}, ${JSON.stringify(s.code)})`;
		case 'exit':
			return `exit(${s.pass})`;
		case 'actionRef':
			return `actionRef(${JSON.stringify(s.actionId)}${s.name !== undefined ? `, ${JSON.stringify(s.name)}` : ''})`;
		case 'assertUrl':
			return s.exact ? `assertUrl(${JSON.stringify(s.url)}, true)` : `assertUrl(${JSON.stringify(s.url)})`;
		case 'screenshot':
			return `screenshot(${JSON.stringify({ name: s.name, fullPage: s.fullPage })})`;
		case 'visualCheck':
			return `visualCheck(${JSON.stringify(s.name)}, ${JSON.stringify({
				fullPage: s.fullPage,
				...(s.ignoreRegions ? { ignoreRegions: s.ignoreRegions } : {}),
				...(s.tolerancePct !== undefined ? { tolerancePct: s.tolerancePct } : {}),
				...(s.exclude ? { exclude: s.exclude } : {}),
				...(s.selector !== undefined ? { selector: s.selector } : {}),
			})})`;
		case 'aiStep':
			return `ai(${JSON.stringify(s.instruction)})`;
		case 'totp':
			return `totp(${loc(s.locator)}, ${JSON.stringify(s.secret)})`;
		case 'setVar':
			return `setVar(${JSON.stringify(s.name)}, ${JSON.stringify(s.value)})`;
		case 'execJs':
			return `execJs(${JSON.stringify(s.code)})`;
		case 'assertJs':
			return `assertJs(${JSON.stringify(s.code)})`;
	}
}

/**
 * Parse editable script back into a validated DSL test — the inverse of {@link toCode}.
 * The script is executed against a step-collecting builder (no page/DOM access), then
 * validated with the Zod schema.
 *
 * @param code - the script (bare builder calls).
 * @returns the validated Test.
 */
export function fromCode(code: string): Test {
	const steps: unknown[] = [];
	const builder: Record<string, (...args: unknown[]) => void> = {
		goto: (url) => steps.push({ type: 'goto', url }),
		click: (locator, opts) => steps.push({ type: 'click', locator, ...((opts as object) ?? {}) }),
		fill: (locator, value) => steps.push({ type: 'fill', locator, value }),
		press: (key, locator) => steps.push({ type: 'press', key, ...(locator ? { locator } : {}) }),
		hover: (locator) => steps.push({ type: 'hover', locator }),
		select: (locator, values) => steps.push({ type: 'select', locator, values }),
		wait: (opts) => steps.push({ type: 'wait', ...(opts as object) }),
		assertText: (locator, text, mode) => steps.push({ type: 'assertText', locator, text, ...(mode ? { mode } : {}) }),
		assertVisible: (locator) => steps.push({ type: 'assertVisible', locator }),
		assertNotVisible: (locator) => steps.push({ type: 'assertNotVisible', locator }),
		assertPresent: (locator) => steps.push({ type: 'assertPresent', locator }),
		assertNotPresent: (locator) => steps.push({ type: 'assertNotPresent', locator }),
		assertNotText: (locator, text, mode) => steps.push({ type: 'assertNotText', locator, text, ...(mode ? { mode } : {}) }),
		dragAndDrop: (from, to) => steps.push({ type: 'dragAndDrop', from, to }),
		scroll: (locator) => steps.push({ type: 'scroll', ...(locator ? { locator } : {}) }),
		back: () => steps.push({ type: 'back' }),
		refresh: () => steps.push({ type: 'refresh' }),
		upload: (locator, files) => steps.push({ type: 'upload', locator, files }),
		extract: (name, locator) => steps.push({ type: 'extract', name, locator }),
		extractJs: (name, code) => steps.push({ type: 'extractJs', name, code }),
		exit: (pass) => steps.push({ type: 'exit', pass }),
		actionRef: (actionId, name) => steps.push({ type: 'actionRef', actionId, ...(name !== undefined ? { name } : {}) }),
		assertUrl: (url, exact) => steps.push({ type: 'assertUrl', url, ...(exact ? { exact } : {}) }),
		screenshot: (opts) => steps.push({ type: 'screenshot', ...(opts as object) }),
		visualCheck: (name, opts) => steps.push({ type: 'visualCheck', name, ...(opts as object) }),
		ai: (instruction) => steps.push({ type: 'aiStep', instruction }),
		totp: (locator, secret) => steps.push({ type: 'totp', locator, secret }),
		setVar: (name, value) => steps.push({ type: 'setVar', name, value }),
		execJs: (code) => steps.push({ type: 'execJs', code }),
		assertJs: (code) => steps.push({ type: 'assertJs', code }),
	};

	const bind = `const { ${BUILDER_KEYS.join(', ')} } = __t;\n`;
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	new Function('__t', bind + code)(builder);
	return testSchema.parse({ steps });
}
