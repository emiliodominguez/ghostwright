import { describe, it, expect } from 'vitest';
import { parseTest } from '@ghostwright/dsl';

import { ACTION_GROUPS, ALL_ACTIONS } from './stepActions';

describe('ACTION_GROUPS', () => {
	it('is non-empty', () => {
		expect(ACTION_GROUPS.length).toBeGreaterThan(0);
	});

	it.each(ACTION_GROUPS.map((g) => [g.category, g] as const))(
		'group "%s" has a category string and a non-empty actions array',
		(_category, group) => {
			expect(typeof group.category).toBe('string');
			expect(group.category.length).toBeGreaterThan(0);
			expect(Array.isArray(group.actions)).toBe(true);
			expect(group.actions.length).toBeGreaterThan(0);
		},
	);
});

describe('ALL_ACTIONS', () => {
	it('equals the flattened group actions', () => {
		expect(ALL_ACTIONS).toEqual(ACTION_GROUPS.flatMap((g) => g.actions));
	});

	it('has a length equal to the sum of group action lengths', () => {
		const sum = ACTION_GROUPS.reduce((n, g) => n + g.actions.length, 0);

		expect(ALL_ACTIONS.length).toBe(sum);
	});

	it('has a unique type for every action', () => {
		const types = ALL_ACTIONS.map((a) => a.type);
		const unique = new Set(types);

		expect(unique.size).toBe(types.length);
	});
});

describe('each action', () => {
	it.each(ALL_ACTIONS.map((a) => [a.label, a] as const))(
		'"%s" has a non-empty label',
		(_label, action) => {
			expect(typeof action.label).toBe('string');
			expect(action.label.length).toBeGreaterThan(0);
		},
	);

	it.each(ALL_ACTIONS.map((a) => [a.label, a] as const))(
		'"%s" make() returns an object whose .type matches the declared type',
		(_label, action) => {
			const step = action.make();

			expect(step.type).toBe(action.type);
		},
	);

	it.each(ALL_ACTIONS.map((a) => [a.label, a] as const))(
		'"%s" make() is a factory returning a fresh object each call',
		(_label, action) => {
			const a = action.make();
			const b = action.make();

			expect(a).not.toBe(b);
			expect(a).toEqual(b);
		},
	);

	/**
	 * Documented exceptions: these actions' `make()` factories return `name: ''`,
	 * but the DSL schema requires `name: z.string().min(1)` for these step types
	 * (see packages/dsl/src/schema.ts — extractStep, extractJsStep, setVarStep).
	 * The default step therefore fails DSL validation until the user fills in a
	 * name. Per task instructions stepActions.ts is left unmodified; instead we
	 * assert the specific validation error these produce so the mismatch is
	 * captured rather than silently swallowed.
	 */
	const KNOWN_INVALID_DEFAULTS = new Set(['extract', 'setVar', 'extractJs']);

	it.each(ALL_ACTIONS.filter((a) => !KNOWN_INVALID_DEFAULTS.has(a.type)).map((a) => [a.label, a] as const))(
		'"%s" make() produces a valid DSL step',
		(_label, action) => {
			expect(() => parseTest({ steps: [action.make()] })).not.toThrow();
		},
	);

	it.each(ALL_ACTIONS.filter((a) => KNOWN_INVALID_DEFAULTS.has(a.type)).map((a) => [a.label, a] as const))(
		'"%s" make() is a documented exception: rejected by the DSL for an empty name',
		(_label, action) => {
			expect(() => parseTest({ steps: [action.make()] })).toThrow(/name/i);
		},
	);
});
