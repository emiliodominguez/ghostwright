import { encrypt } from '@ghostwright/crypto';
import { db, tables } from '@ghostwright/db';
import { runQueue } from '@ghostwright/queue';
import { eq } from 'drizzle-orm';

/**
 * Reset the app data and seed a realistic set of tests against stable public sites,
 * plus the secrets and a login flow they use. Run with `pnpm db:seed`.
 */

type Step = Record<string, unknown>;
const test = (name: string, steps: Step[], settings?: Record<string, unknown>) => ({ name, steps, settings });

async function main(): Promise<void> {
	// Wipe existing data (children first to respect foreign keys). Keeps org/project/user/api keys.
	await db.delete(tables.stepResult);
	await db.delete(tables.run);
	await db.delete(tables.baseline);
	await db.delete(tables.schedule);
	await db.delete(tables.testVersion);
	await db.delete(tables.test);
	await db.delete(tables.alert);
	await db.delete(tables.action);
	// Capture runs/steps reference login flows, so clear them before the flows themselves.
	await db.delete(tables.captureStep);
	await db.delete(tables.captureRun);
	await db.delete(tables.loginFlow);
	await db.delete(tables.secret);

	// Ensure a default org + project.
	let project = await db.query.project.findFirst();
	let orgId: string;
	if (!project) {
		const [org] = await db.insert(tables.org).values({ name: 'default' }).returning();
		const [p] = await db.insert(tables.project).values({ orgId: org!.id, name: 'default' }).returning();
		project = p!;
		orgId = org!.id;
	} else {
		orgId = project.orgId;
	}
	const projectId = project.id;

	// Secrets (encrypted at rest) — referenced in tests as {{secret.NAME}}.
	await db.insert(tables.secret).values([
		{ orgId, name: 'herokuPassword', kind: 'password', ref: encrypt('SuperSecretPassword!') },
		{ orgId, name: 'saucePassword', kind: 'password', ref: encrypt('secret_sauce') },
	]);

	// A login flow for the-internet secure area (capture its session, then bind it to a test).
	const loginFlow = {
		steps: [
			{ type: 'goto', url: 'https://the-internet.herokuapp.com/login' },
			{ type: 'fill', locator: { css: '#username' }, value: 'tomsmith' },
			{ type: 'fill', locator: { css: '#password' }, value: '{{secret.herokuPassword}}' },
			{ type: 'click', locator: { css: 'button[type="submit"]' } },
			{ type: 'assertVisible', locator: { css: '#flash' } },
		],
	};
	const [flow] = await db.insert(tables.loginFlow).values({ projectId, name: 'The Internet secure area', dsl: JSON.stringify(loginFlow) }).returning();

	const tests = [
		test('Homepage is up (example.org)', [
			{ type: 'goto', url: 'https://example.org' },
			{ type: 'assertVisible', locator: { role: 'heading', name: 'Example Domain' } },
			{ type: 'assertText', locator: { role: 'heading' }, text: 'Example Domain' },
			{ type: 'assertVisible', locator: { role: 'link', name: 'Learn more' } },
		]),
		test('Sign in to the secure area (The Internet)', [
			{ type: 'goto', url: 'https://the-internet.herokuapp.com/login' },
			{ type: 'fill', locator: { css: '#username' }, value: 'tomsmith' },
			{ type: 'fill', locator: { css: '#password' }, value: '{{secret.herokuPassword}}' },
			{ type: 'click', locator: { css: 'button[type="submit"]' } },
			{ type: 'assertText', locator: { css: '#flash' }, text: 'You logged into a secure area!' },
		]),
		test('Add a backpack to the cart (Sauce Demo)', [
			{ type: 'goto', url: 'https://www.saucedemo.com/' },
			{ type: 'fill', locator: { css: '#user-name' }, value: 'standard_user' },
			{ type: 'fill', locator: { css: '#password' }, value: '{{secret.saucePassword}}' },
			{ type: 'click', locator: { css: '#login-button' } },
			{ type: 'assertVisible', locator: { css: '.inventory_list' } },
			{ type: 'click', locator: { css: '[data-test="add-to-cart-sauce-labs-backpack"]' } },
			{ type: 'assertText', locator: { css: '.shopping_cart_badge' }, text: '1' },
		]),
		test('Playwright docs are reachable', [
			{ type: 'goto', url: 'https://playwright.dev/' },
			{ type: 'assertVisible', locator: { role: 'link', name: 'Get started' } },
		]),
		test('Wikipedia article renders', [
			{ type: 'goto', url: 'https://en.wikipedia.org/wiki/Software_testing' },
			{ type: 'assertVisible', locator: { css: '#firstHeading' } },
			{ type: 'assertText', locator: { css: '#firstHeading' }, text: 'Software testing' },
		]),
		test('Homepage visual snapshot (example.org)', [
			{ type: 'goto', url: 'https://example.org' },
			{ type: 'visualCheck', name: 'homepage', tolerancePct: 1 },
		]),
		// Bound to the login flow — starts already signed in, so it can hit /secure directly.
		test(
			'Secure area stays accessible (uses saved login)',
			[
				{ type: 'goto', url: 'https://the-internet.herokuapp.com/secure' },
				{ type: 'assertText', locator: { css: 'h2' }, text: 'Secure Area' },
				{ type: 'assertVisible', locator: { css: 'a[href="/logout"]' } },
			],
			{ loginFlowId: flow!.id },
		),
	];

	for (const t of tests) {
		const [row] = await db
			.insert(tables.test)
			.values({ projectId, name: t.name, settings: t.settings ? JSON.stringify(t.settings) : null })
			.returning();
		const [version] = await db.insert(tables.testVersion).values({ testId: row!.id, dsl: JSON.stringify({ steps: t.steps }) }).returning();
		await db.update(tables.test).set({ currentVersionId: version!.id }).where(eq(tables.test.id, row!.id));
	}

	// Capture the login flow's session now (best-effort; needs the worker running + network),
	// so the login-bound test works out of the box instead of failing until captured manually.
	await runQueue.add('capture', { captureLoginState: flow!.id });

	console.log(`seeded ${tests.length} tests, 2 secrets, 1 login flow (capturing session…)`);
	// Give the enqueue a moment to flush to Redis before the process exits.
	await new Promise((r) => setTimeout(r, 500));
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
