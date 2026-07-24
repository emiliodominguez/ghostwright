import { randomBytes, randomUUID } from 'node:crypto';

const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Radia', 'Dennis', 'Barbara'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Torvalds', 'Perlman', 'Ritchie', 'Liskov'];
const WORDS = ['lorem', 'ipsum', 'dolor', 'amet', 'ghost', 'wright', 'render', 'sable'];
const CITIES = ['Austin', 'Berlin', 'Lisbon', 'Nairobi', 'Osaka', 'Quito'];

function pick(list: string[]): string {
	return list[Math.floor(Math.random() * list.length)] ?? '';
}
function alnum(n: number): string {
	return randomBytes(n)
		.toString('base64')
		.replace(/[^a-zA-Z0-9]/g, '')
		.slice(0, n);
}

/**
 * Generate a built-in / Faker-like variable value, or undefined if the key isn't built in.
 * Values are meant to be cached per run by the caller so `{{internet.email}}` is stable.
 *
 * @param key - the variable name (e.g. `timestamp`, `internet.email`).
 * @returns the generated value, or undefined for unknown keys.
 */
export function generateBuiltin(key: string): string | undefined {
	const first = pick(FIRST);
	const last = pick(LAST);
	switch (key) {
		case 'timestamp':
			return String(Date.now());
		case 'alphanumeric':
			return alnum(16);
		case 'uuid':
		case 'random.uuid':
			return randomUUID();
		case 'random.number':
			return String(Math.floor(Math.random() * 100000));
		case 'name.firstName':
			return first;
		case 'name.lastName':
			return last;
		case 'name.fullName':
			return `${first} ${last}`;
		case 'internet.email':
			return `${first}.${last}.${alnum(4)}@example.com`.toLowerCase();
		case 'internet.userName':
			return `${first}${alnum(4)}`.toLowerCase();
		case 'internet.password':
			return alnum(12);
		case 'company.companyName':
			return `${last} ${pick(['Labs', 'Systems', 'Works', 'Co'])}`;
		case 'address.city':
			return pick(CITIES);
		case 'phone.phoneNumber':
			return `+1${Math.floor(1000000000 + Math.random() * 8999999999)}`;
		case 'commerce.price':
			return (Math.random() * 100 + 1).toFixed(2);
		case 'lorem.word':
			return pick(WORDS);
		case 'lorem.sentence':
			return `${Array.from({ length: 6 }, () => pick(WORDS)).join(' ')}.`;
		default:
			return undefined;
	}
}

/**
 * Create a fresh per-run variable store plus a resolver that lazily fills in built-ins
 * and caches them, so repeated `{{token}}` references return the same value within a run.
 *
 * @returns `{ vars, resolveVar }` to spread onto a `RunContext`.
 */
export function makeVarStore(): { vars: Record<string, string>; resolveVar: (key: string) => string | undefined } {
	const vars: Record<string, string> = {};
	const resolveVar = (key: string): string | undefined => {
		if (key in vars) return vars[key];
		const v = generateBuiltin(key);
		if (v !== undefined) vars[key] = v;
		return v;
	};
	return { vars, resolveVar };
}
