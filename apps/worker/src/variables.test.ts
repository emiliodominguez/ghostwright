import { describe, it, expect } from 'vitest';

import { generateBuiltin, makeVarStore } from './variables';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('generateBuiltin', () => {
	it('timestamp is all digits', () => {
		const v = generateBuiltin('timestamp');

		expect(v).toBeDefined();
		expect(v).toMatch(/^\d+$/);
	});

	it('alphanumeric is 16 alnum chars', () => {
		const v = generateBuiltin('alphanumeric');

		expect(v).toBeDefined();
		expect(v).toMatch(/^[a-zA-Z0-9]{16}$/);
	});

	it('uuid matches uuid shape', () => {
		expect(generateBuiltin('uuid')).toMatch(UUID_RE);
	});

	it('random.uuid matches uuid shape', () => {
		expect(generateBuiltin('random.uuid')).toMatch(UUID_RE);
	});

	it('random.number is digits', () => {
		expect(generateBuiltin('random.number')).toMatch(/^\d+$/);
	});

	it('name.firstName is non-empty', () => {
		const v = generateBuiltin('name.firstName');

		expect(v).toBeDefined();
		expect((v ?? '').length).toBeGreaterThan(0);
	});

	it('name.lastName is non-empty', () => {
		const v = generateBuiltin('name.lastName');

		expect(v).toBeDefined();
		expect((v ?? '').length).toBeGreaterThan(0);
	});

	it('name.fullName contains a space', () => {
		const v = generateBuiltin('name.fullName');

		expect(v).toBeDefined();
		expect(v).toMatch(/\S+ \S+/);
	});

	it('internet.email ends with @example.com and is lowercase', () => {
		const v = generateBuiltin('internet.email');

		expect(v).toBeDefined();
		expect(v).toMatch(/@example\.com$/);
		expect(v).toBe((v ?? '').toLowerCase());
	});

	it('internet.userName is lowercase and non-empty', () => {
		const v = generateBuiltin('internet.userName');

		expect(v).toBeDefined();
		expect((v ?? '').length).toBeGreaterThan(0);
		expect(v).toBe((v ?? '').toLowerCase());
	});

	it('internet.password is 12 chars', () => {
		const v = generateBuiltin('internet.password');

		expect(v).toBeDefined();
		expect(v).toHaveLength(12);
	});

	it('company.companyName ends with a known suffix', () => {
		const v = generateBuiltin('company.companyName');

		expect(v).toBeDefined();
		expect(v).toMatch(/ (Labs|Systems|Works|Co)$/);
	});

	it('address.city is a known city', () => {
		const v = generateBuiltin('address.city');

		expect(v).toBeDefined();
		expect(['Austin', 'Berlin', 'Lisbon', 'Nairobi', 'Osaka', 'Quito']).toContain(v);
	});

	it('phone.phoneNumber starts with +1 then 10 digits', () => {
		const v = generateBuiltin('phone.phoneNumber');

		expect(v).toBeDefined();
		expect(v).toMatch(/^\+1\d{10}$/);
	});

	it('commerce.price matches a two-decimal price', () => {
		const v = generateBuiltin('commerce.price');

		expect(v).toBeDefined();
		expect(v).toMatch(/^\d+\.\d\d$/);
	});

	it('lorem.word is a known word', () => {
		const v = generateBuiltin('lorem.word');

		expect(v).toBeDefined();
		expect(['lorem', 'ipsum', 'dolor', 'amet', 'ghost', 'wright', 'render', 'sable']).toContain(v);
	});

	it('lorem.sentence ends with a period', () => {
		const v = generateBuiltin('lorem.sentence');

		expect(v).toBeDefined();
		expect(v).toMatch(/\.$/);
		expect((v ?? '').length).toBeGreaterThan(1);
	});

	it('returns undefined for an unknown key', () => {
		expect(generateBuiltin('nope.unknown')).toBeUndefined();
	});
});

describe('makeVarStore', () => {
	it('caches a resolved known key so repeated calls return the identical value', () => {
		const { vars, resolveVar } = makeVarStore();

		const first = resolveVar('uuid');
		const second = resolveVar('uuid');

		expect(first).toMatch(UUID_RE);
		expect(second).toBe(first);
		expect(vars.uuid).toBe(first);
	});

	it('caches a random email so repeated calls stay stable', () => {
		const { vars, resolveVar } = makeVarStore();

		const first = resolveVar('internet.email');
		const second = resolveVar('internet.email');

		expect(first).toMatch(/@example\.com$/);
		expect(second).toBe(first);
		expect(vars['internet.email']).toBe(first);
	});

	it('returns undefined for an unknown key and does not populate vars', () => {
		const { vars, resolveVar } = makeVarStore();

		expect(resolveVar('nope.unknown')).toBeUndefined();
		expect('nope.unknown' in vars).toBe(false);
		expect(Object.keys(vars)).toHaveLength(0);
	});

	it('exposes cached values through the returned vars object', () => {
		const { vars, resolveVar } = makeVarStore();

		const name = resolveVar('name.fullName');

		expect(vars['name.fullName']).toBe(name);
	});
});
