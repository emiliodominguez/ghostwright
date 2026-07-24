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
 * A styled piece of a step description. Render sites map each kind to its own
 * styling so quoted values, selectors, URLs, and disambiguators stand out from
 * the surrounding prose (and raw backticks/quotes never leak into the UI).
 *
 * - `text`  — ordinary prose ("Click", "into the field").
 * - `value` — a user-supplied string value (what to type, a heading's text).
 * - `code`  — a selector or code fragment (CSS/XPath), shown monospace.
 * - `url`   — a web address.
 * - `nth`   — a disambiguator like "#2" / "in the embedded frame".
 */
export interface DescSegment {
	kind: 'text' | 'value' | 'code' | 'url' | 'nth';
	text: string;
}

/** Builders that keep step composition terse while tagging each piece. */
const t = (text: string): DescSegment => ({ kind: 'text', text });
const val = (text: string): DescSegment => ({ kind: 'value', text });
const code = (text: string): DescSegment => ({ kind: 'code', text });
const url = (text: string): DescSegment => ({ kind: 'url', text });
const nthSeg = (text: string): DescSegment => ({ kind: 'nth', text });

/**
 * Describe an element locator as styled segments, e.g. the "Sign in" button.
 *
 * @param l - the DSL locator.
 * @returns the segments for a human-readable noun phrase for the element.
 */
export function describeLocatorSegments(l: Locator): DescSegment[] {
	const segs = describeStrategySegments(l);
	if (l.nth !== undefined) segs.push(nthSeg(`(#${l.nth + 1})`));
	if (l.frame !== undefined) segs.push(nthSeg('(in the embedded frame)'));
	return segs;
}

/** The core noun-phrase segments for a locator's strategy, without the nth suffix. */
function describeStrategySegments(l: Locator): DescSegment[] {
	if (l.role !== undefined) {
		const noun = ROLE_NOUN[l.role] ?? l.role;
		return l.name ? [t('the'), val(`"${l.name}"`), t(noun)] : [t(`the ${noun}`)];
	}
	if (l.text !== undefined) return [t('the element that says'), val(`"${l.text}"`)];
	if (l.placeholder !== undefined) return [t('the field with placeholder'), val(`"${l.placeholder}"`)];
	if (l.label !== undefined) return [t('the field labeled'), val(`"${l.label}"`)];
	if (l.testId !== undefined) return [t('the element with test id'), val(`"${l.testId}"`)];
	if (l.altText !== undefined) return [t('the image'), val(`"${l.altText}"`)];
	if (l.title !== undefined) return [t('the element titled'), val(`"${l.title}"`)];
	if (l.css !== undefined) {
		const match = l.css.match(/^text=(.+)$/);
		return match ? [t('the element that says'), val(`"${match[1]}"`)] : [t('the element'), code(l.css)];
	}
	if (l.xpath !== undefined) return [t('the element at'), code(l.xpath)];
	return [t('the element')];
}

/**
 * Describe an element locator in plain language, e.g. `the "Sign in" button`.
 *
 * @param l - the DSL locator.
 * @returns a human-readable noun phrase for the element.
 */
export function describeLocator(l: Locator): string {
	return segmentsToString(describeLocatorSegments(l));
}

/**
 * Turn a validated DSL step into styled description segments. This is the source
 * of truth; `describeStep` flattens the same segments to a plain string.
 *
 * @param s - a validated DSL step.
 * @returns the segments describing what the step does, in reading order.
 */
export function describeSegments(s: Step): DescSegment[] {
	switch (s.type) {
		case 'goto':
			return [t('Go to'), url(s.url)];
		case 'click':
			return [t(s.double ? 'Double-click' : s.button === 'right' ? 'Right-click' : 'Click'), ...describeLocatorSegments(s.locator)];
		case 'fill':
			return [t('Type'), val(`"${s.value}"`), t('into'), ...describeLocatorSegments(s.locator)];
		case 'press':
			return s.locator ? [t('Press the'), code(s.key), t('key in'), ...describeLocatorSegments(s.locator)] : [t('Press the'), code(s.key), t('key')];
		case 'hover':
			return [t('Hover over'), ...describeLocatorSegments(s.locator)];
		case 'select': {
			const values: DescSegment[] = s.values.flatMap((v, i) => (i === 0 ? [val(`"${v}"`)] : [t(','), val(`"${v}"`)]));
			return [t('Choose'), ...values, t('in'), ...describeLocatorSegments(s.locator)];
		}
		case 'wait':
			if (s.locator) return [t('Wait for'), ...describeLocatorSegments(s.locator), t(`to be ${s.state ?? 'visible'}`)];
			return [t('Wait'), val(((s.timeoutMs ?? 1000) / 1000).toString()), t('seconds')];
		case 'waitForUrl':
			return [t('Wait until the web address matches'), val(`"${s.url}"`)];
		case 'waitForLoadState':
			return s.state === 'networkidle' ? [t('Wait for the page to settle (no network activity)')] : [t('Wait for the page'), val(`"${s.state}"`), t('event')];
		case 'assertText':
			return [t('Check that'), ...describeLocatorSegments(s.locator), t(s.mode === 'exact' ? 'says exactly' : 'contains'), val(`"${s.text}"`)];
		case 'assertVisible':
			return [t('Check that'), ...describeLocatorSegments(s.locator), t('is visible')];
		case 'assertNotVisible':
			return [t('Check that'), ...describeLocatorSegments(s.locator), t('is not visible')];
		case 'assertPresent':
			return [t('Check that'), ...describeLocatorSegments(s.locator), t('exists on the page')];
		case 'assertNotPresent':
			return [t('Check that'), ...describeLocatorSegments(s.locator), t('does not exist on the page')];
		case 'assertNotText':
			return [t('Check that'), ...describeLocatorSegments(s.locator), t(s.mode === 'exact' ? 'does not say' : 'does not contain'), val(`"${s.text}"`)];
		case 'dragAndDrop':
			return [t('Drag'), ...describeLocatorSegments(s.from), t('onto'), ...describeLocatorSegments(s.to)];
		case 'scroll':
			return s.locator ? [t('Scroll to'), ...describeLocatorSegments(s.locator)] : [t('Scroll to the bottom of the page')];
		case 'back':
			return [t('Go back to the previous page')];
		case 'refresh':
			return [t('Refresh the page')];
		case 'upload':
			return [t(`Upload ${s.files.length} file${s.files.length === 1 ? '' : 's'} to`), ...describeLocatorSegments(s.locator)];
		case 'extract':
			return [t('Save the text of'), ...describeLocatorSegments(s.locator), t('into'), val(`"${s.name}"`)];
		case 'extractJs':
			return [t('Save a custom-code result into'), val(`"${s.name}"`)];
		case 'exit':
			return [t(s.pass ? 'Stop the test here (pass)' : 'Stop the test here (fail)')];
		case 'actionRef':
			return [t('Run the'), val(`"${s.name ?? 'reusable'}"`), t('action')];
		case 'assertUrl':
			return [t(`Check the web address ${s.exact ? 'is' : 'contains'}`), url(s.url)];
		case 'screenshot':
			return s.name ? [t('Take a screenshot'), val(`("${s.name}")`)] : [t('Take a screenshot')];
		case 'visualCheck':
			return [t('Compare the page against the saved look'), val(`"${s.name}"`)];
		case 'aiStep':
			return [t('AI:'), val(s.instruction)];
		case 'totp':
			return [t('Enter the 2-factor code into'), ...describeLocatorSegments(s.locator)];
		case 'setVar':
			return [t('Set'), val(`"${s.name}"`), t('to'), val(`"${s.value}"`)];
		case 'execJs':
			return [t('Run custom code')];
		case 'assertJs':
			return [t('Check with custom code')];
	}
}

/** Join description segments back into a single plain string (spaces between segments). */
function segmentsToString(segs: DescSegment[]): string {
	let out = '';
	for (const seg of segs) {
		// Code segments keep their backtick markup in the string form (for logs/plain text);
		// no space before a bare punctuation segment like a comma.
		const piece = seg.kind === 'code' ? `\`${seg.text}\`` : seg.text;
		if (out === '' || piece === ',') out += piece;
		else out += ` ${piece}`;
	}
	return out;
}

/**
 * Turn a validated DSL step into a plain-English sentence a non-technical person can read.
 * Used wherever a flat string is needed (logs, the plain-text export); the UI prefers
 * `describeSegments` so it can style values, selectors, and URLs distinctly.
 *
 * @param s - a validated DSL step.
 * @returns a single friendly sentence describing what the step does.
 * @example describeStep({ type: 'click', locator: { role: 'button', name: 'Save' } }) // 'Click the "Save" button'
 */
export function describeStep(s: Step): string {
	return segmentsToString(describeSegments(s));
}
