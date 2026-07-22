import type { Step } from '@ghostwright/dsl';

export type ActionDef = { type: Step['type']; label: string; make: () => Step };

/**
 * Actions grouped into scannable categories (most-reached-for first within each),
 * shared by the step builder and the "Add step" chooser.
 */
export const ACTION_GROUPS: { category: string; actions: ActionDef[] }[] = [
	{
		category: 'Navigate',
		actions: [
			{ type: 'goto', label: 'Go to a web page', make: () => ({ type: 'goto', url: 'https://' }) },
			{ type: 'back', label: 'Go back', make: () => ({ type: 'back' }) },
			{ type: 'refresh', label: 'Refresh the page', make: () => ({ type: 'refresh' }) },
			{ type: 'scroll', label: 'Scroll', make: () => ({ type: 'scroll' }) },
		],
	},
	{
		category: 'Interact',
		actions: [
			{ type: 'click', label: 'Click something', make: () => ({ type: 'click', locator: { role: 'button' } }) },
			{ type: 'fill', label: 'Type some text', make: () => ({ type: 'fill', locator: { role: 'textbox' }, value: '' }) },
			{ type: 'select', label: 'Choose from a dropdown', make: () => ({ type: 'select', locator: { role: 'combobox' }, values: [''] }) },
			{ type: 'hover', label: 'Hover over something', make: () => ({ type: 'hover', locator: { role: 'button' } }) },
			{ type: 'press', label: 'Press a key', make: () => ({ type: 'press', key: 'Enter' }) },
			{ type: 'dragAndDrop', label: 'Drag and drop', make: () => ({ type: 'dragAndDrop', from: { role: 'button' }, to: { role: 'button' } }) },
			{ type: 'upload', label: 'Upload a file', make: () => ({ type: 'upload', locator: { role: 'button' }, files: [''] }) },
			{ type: 'totp', label: 'Enter a 2-factor code', make: () => ({ type: 'totp', locator: { role: 'textbox' }, secret: '' }) },
		],
	},
	{
		category: 'Check',
		actions: [
			{ type: 'assertVisible', label: 'Check something is visible', make: () => ({ type: 'assertVisible', locator: { role: 'heading' } }) },
			{ type: 'assertText', label: 'Check the text on the page', make: () => ({ type: 'assertText', locator: { role: 'heading' }, text: '', mode: 'contains' }) },
			{ type: 'assertUrl', label: 'Check the web address', make: () => ({ type: 'assertUrl', url: '/', exact: false }) },
			{ type: 'assertNotVisible', label: 'Check something is hidden', make: () => ({ type: 'assertNotVisible', locator: { role: 'heading' } }) },
			{ type: 'assertPresent', label: 'Check something exists', make: () => ({ type: 'assertPresent', locator: { role: 'button' } }) },
			{ type: 'assertNotPresent', label: 'Check something is gone', make: () => ({ type: 'assertNotPresent', locator: { role: 'button' } }) },
			{ type: 'assertNotText', label: 'Check text is absent', make: () => ({ type: 'assertNotText', locator: { role: 'heading' }, text: '', mode: 'contains' }) },
			{ type: 'visualCheck', label: 'Compare against a saved look', make: () => ({ type: 'visualCheck', name: '', fullPage: false }) },
		],
	},
	{
		category: 'Wait',
		actions: [
			{ type: 'wait', label: 'Wait (time or for an element)', make: () => ({ type: 'wait', timeoutMs: 1000 }) },
			{ type: 'waitForUrl', label: 'Wait for the web address', make: () => ({ type: 'waitForUrl', url: '' }) },
			{ type: 'waitForLoadState', label: 'Wait for the page to settle', make: () => ({ type: 'waitForLoadState', state: 'networkidle' }) },
		],
	},
	{
		category: 'Capture & data',
		actions: [
			{ type: 'screenshot', label: 'Take a screenshot', make: () => ({ type: 'screenshot', fullPage: false }) },
			{ type: 'extract', label: 'Save text into a variable', make: () => ({ type: 'extract', name: '', locator: { role: 'heading' } }) },
			{ type: 'setVar', label: 'Set a variable', make: () => ({ type: 'setVar', name: '', value: '' }) },
		],
	},
	{
		category: 'AI & code',
		actions: [
			{ type: 'aiStep', label: 'Describe it in plain words', make: () => ({ type: 'aiStep', instruction: '' }) },
			{ type: 'extractJs', label: 'Save a code result', make: () => ({ type: 'extractJs', name: '', code: 'return document.title;' }) },
			{ type: 'execJs', label: 'Run custom code', make: () => ({ type: 'execJs', code: '' }) },
			{ type: 'assertJs', label: 'Check with custom code', make: () => ({ type: 'assertJs', code: 'return true;' }) },
			{ type: 'exit', label: 'Stop the test', make: () => ({ type: 'exit', pass: true }) },
		],
	},
];

export const ALL_ACTIONS: ActionDef[] = ACTION_GROUPS.flatMap((g) => g.actions);
