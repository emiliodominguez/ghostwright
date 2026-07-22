import type { Locator, Step } from './schema';

/** Friendly nouns for ARIA roles, so steps read like plain English. */
const ROLE_NOUN: Record<string, string> = {
	button: 'button',
	link: 'link',
	textbox: 'text box',
	checkbox: 'checkbox',
	radio: 'radio button',
	combobox: 'dropdown',
	listbox: 'dropdown',
	heading: 'heading',
	img: 'image',
	tab: 'tab',
	menuitem: 'menu item',
	option: 'option',
};

/**
 * Describe an element locator in plain language, e.g. `the "Sign in" button`.
 *
 * @param l - the DSL locator.
 * @returns a human-readable noun phrase for the element.
 */
export function describeLocator(l: Locator): string {
	const nth = l.nth !== undefined ? ` (#${l.nth + 1})` : '';
	return describeStrategy(l) + nth;
}

/** The core noun phrase for a locator's strategy, without the nth suffix. */
function describeStrategy(l: Locator): string {
	if (l.role !== undefined) {
		const noun = ROLE_NOUN[l.role] ?? l.role;
		return l.name ? `the "${l.name}" ${noun}` : `the ${noun}`;
	}
	if (l.text !== undefined) return `the element that says "${l.text}"`;
	if (l.placeholder !== undefined) return `the field with placeholder "${l.placeholder}"`;
	if (l.label !== undefined) return `the field labeled "${l.label}"`;
	if (l.testId !== undefined) return `the element with test id "${l.testId}"`;
	if (l.altText !== undefined) return `the image "${l.altText}"`;
	if (l.title !== undefined) return `the element titled "${l.title}"`;
	if (l.css !== undefined) {
		const text = l.css.match(/^text=(.+)$/);
		return text ? `the element that says "${text[1]}"` : `the element \`${l.css}\``;
	}
	if (l.xpath !== undefined) return `the element at \`${l.xpath}\``;
	return 'the element';
}

/**
 * Turn a validated DSL step into a plain-English sentence a non-technical person can read.
 * Used by the step builder and the run/test pages so nobody has to read code.
 *
 * @param s - a validated DSL step.
 * @returns a single friendly sentence describing what the step does.
 * @example describeStep({ type: 'click', locator: { role: 'button', name: 'Save' } }) // 'Click the "Save" button'
 */
export function describeStep(s: Step): string {
	switch (s.type) {
		case 'goto':
			return `Go to ${s.url}`;
		case 'click':
			return `${s.double ? 'Double-click' : s.button === 'right' ? 'Right-click' : 'Click'} ${describeLocator(s.locator)}`;
		case 'fill':
			return `Type "${s.value}" into ${describeLocator(s.locator)}`;
		case 'press':
			return s.locator ? `Press the ${s.key} key in ${describeLocator(s.locator)}` : `Press the ${s.key} key`;
		case 'hover':
			return `Hover over ${describeLocator(s.locator)}`;
		case 'select':
			return `Choose ${s.values.map((v) => `"${v}"`).join(', ')} in ${describeLocator(s.locator)}`;
		case 'wait':
			if (s.locator) return `Wait for ${describeLocator(s.locator)} to be ${s.state ?? 'visible'}`;
			return `Wait ${((s.timeoutMs ?? 1000) / 1000).toString()} seconds`;
		case 'waitForUrl':
			return `Wait until the web address matches "${s.url}"`;
		case 'waitForLoadState':
			return s.state === 'networkidle' ? 'Wait for the page to settle (no network activity)' : `Wait for the page "${s.state}" event`;
		case 'assertText':
			return `Check that ${describeLocator(s.locator)} ${s.mode === 'exact' ? 'says exactly' : 'contains'} "${s.text}"`;
		case 'assertVisible':
			return `Check that ${describeLocator(s.locator)} is visible`;
		case 'assertNotVisible':
			return `Check that ${describeLocator(s.locator)} is not visible`;
		case 'assertPresent':
			return `Check that ${describeLocator(s.locator)} exists on the page`;
		case 'assertNotPresent':
			return `Check that ${describeLocator(s.locator)} does not exist on the page`;
		case 'assertNotText':
			return `Check that ${describeLocator(s.locator)} does not ${s.mode === 'exact' ? 'say' : 'contain'} "${s.text}"`;
		case 'dragAndDrop':
			return `Drag ${describeLocator(s.from)} onto ${describeLocator(s.to)}`;
		case 'scroll':
			return s.locator ? `Scroll to ${describeLocator(s.locator)}` : 'Scroll to the bottom of the page';
		case 'back':
			return 'Go back to the previous page';
		case 'refresh':
			return 'Refresh the page';
		case 'upload':
			return `Upload ${s.files.length} file${s.files.length === 1 ? '' : 's'} to ${describeLocator(s.locator)}`;
		case 'extract':
			return `Save the text of ${describeLocator(s.locator)} into "${s.name}"`;
		case 'extractJs':
			return `Save a custom-code result into "${s.name}"`;
		case 'exit':
			return s.pass ? 'Stop the test here (pass)' : 'Stop the test here (fail)';
		case 'actionRef':
			return `Run the "${s.name ?? 'reusable'}" action`;
		case 'assertUrl':
			return `Check the web address ${s.exact ? 'is' : 'contains'} ${s.url}`;
		case 'screenshot':
			return s.name ? `Take a screenshot ("${s.name}")` : 'Take a screenshot';
		case 'visualCheck':
			return `Compare the page against the saved look "${s.name}"`;
		case 'aiStep':
			return `AI: ${s.instruction}`;
		case 'totp':
			return `Enter the 2-factor code into ${describeLocator(s.locator)}`;
		case 'setVar':
			return `Set "${s.name}" to "${s.value}"`;
		case 'execJs':
			return 'Run custom code';
		case 'assertJs':
			return 'Check with custom code';
	}
}
