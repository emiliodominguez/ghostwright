import { encrypt } from '@ghostwright/crypto';
import { db, tables } from '@ghostwright/db';
import { parseTest } from '@ghostwright/dsl';
import { runQueue } from '@ghostwright/queue';
import { eq } from 'drizzle-orm';

/**
 * Clear all app data and seed a realistic suite against the local Wonderly app
 * at http://localhost:3000/ (a Vite + React SPA fronted by a Firebase-backed auth
 * widget). Credentials: emi+test@wonderly.com / {{secret.wonderlyPassword}}.
 *
 * The real login is a progressive email→password form: the homepage offers social
 * providers plus "Log in with email"; clicking it reveals an email field, and a
 * valid work email reveals the password field. Every locator below was verified
 * against the running app.
 *
 * Structure:
 *   - A REUSABLE LOGIN FLOW ("Wonderly login") whose session is captured once and
 *     stored encrypted. Tests bound to it (via settings.loginFlowId) start already
 *     signed in — no need to re-enter credentials each run.
 *   - Five tests that exercise the login SCREEN itself (no account needed).
 *   - One realistic example ("Browse the CRM as a signed-in user") bound to the
 *     login flow: it starts authenticated and moves through the app's sections.
 *
 * The realistic example and the login-flow capture require the Firebase emulator
 * running with the seeded account. The five login-screen tests do not.
 *
 * Run with: pnpm --filter @ghostwright/devtools seed:wonderly
 */

type Step = Record<string, unknown>;
const test = (name: string, steps: Step[], settings?: Record<string, unknown>) => ({ name, steps, settings });

// Verified locators against the live app.
const emailProviderButton = { role: 'button', name: 'Log in with email' };
const emailField = { css: 'input[type="email"]', fallbacks: [{ placeholder: 'name@company.com' }] };
const passwordField = { css: 'input[type="password"]', fallbacks: [{ placeholder: 'Enter your password' }] };
const signInButton = { role: 'button', name: 'Sign in', fallbacks: [{ css: 'button[type="submit"]' }] };

// The CRM/calendar test still runs through the :3000 shell, where the app renders
// inside an embedded iframe. That iframe has NO `src` attribute (its document is set
// programmatically), so a `src`-based selector never matches it; we target its stable
// `allow` attribute instead — `clipboard-write` is unique to the app frame (the
// Stripe/analytics iframes carry only `payment`), verified against a run trace.
const APP_FRAME = 'iframe[allow*="clipboard-write"]';

// The custom-domain test runs directly against the Astro app on :3130 (the
// backend-net sibling repo), which serves the authenticated app standalone with its
// own /login. Hitting it directly means the page renders in the top document, so
// these locators do NOT set a frame (there is no :3000 shell iframe to reach into).

// Add example.com as the custom domain: open Website & Ads, run the "Add custom
// domain" wizard ("Set up" -> type domain -> "Continue" twice), and wait until the
// section shows it as "Connecting". Shared by the set-up and delete tests so the
// delete test is self-contained (it adds a domain first, then removes it).
const addDomainSteps: Step[] = [
	{ type: 'goto', url: 'http://localhost:3130/web/settings/website-ads' },
	{ type: 'wait', locator: { text: 'Custom domain' }, state: 'visible', timeoutMs: 30000 },
	{ type: 'click', locator: { role: 'button', name: 'Set up' } },
	{ type: 'wait', locator: { text: 'Add custom domain' }, state: 'visible', timeoutMs: 15000 },
	{ type: 'fill', locator: { css: 'input[name="domain"]', fallbacks: [{ placeholder: 'example.com' }] }, value: 'example.com' },
	{ type: 'click', locator: { role: 'button', name: 'Continue' } },
	{ type: 'wait', locator: { text: 'Before you continue' }, state: 'visible', timeoutMs: 15000 },
	{ type: 'click', locator: { role: 'button', name: 'Continue' } },
	// "Connecting" appears in several places (header tag + DNS rows), so target the
	// first match — otherwise a strict-mode locator would refuse to wait on 3 elements.
	{ type: 'wait', locator: { text: 'Connecting', nth: 0 }, state: 'visible', timeoutMs: 30000 },
];

// "A custom domain is already configured" — true while the Custom domain section
// shows a Delete control (a leftover from a previous interrupted run). Evaluated in
// the page; every cleanup step below is gated on it, so the sequence runs only when a
// domain exists and each step re-checks the live state.
const DOMAIN_EXISTS = `return [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Delete')`;

// Precondition cleanup: if a domain is already set up (e.g. a prior run failed before
// its own delete), remove it first so the add/remove test starts from a clean slate.
// Each step is conditional on a domain still being present, so all of this is skipped
// when the section is already clean.
const cleanupExistingDomainSteps: Step[] = [
	{ type: 'goto', url: 'http://localhost:3130/web/settings/website-ads' },
	{ type: 'wait', locator: { text: 'Custom domain' }, state: 'visible', timeoutMs: 30000 },
	// Open the confirmation from the Custom domain section (only if a domain exists).
	{ type: 'click', locator: { role: 'button', name: 'Delete', nth: 0 }, condition: DOMAIN_EXISTS },
	{ type: 'wait', locator: { text: 'Delete custom domain?' }, state: 'visible', timeoutMs: 15000, condition: DOMAIN_EXISTS },
	// Confirm: the dialog's own "Delete" is the second matching button.
	{ type: 'click', locator: { role: 'button', name: 'Delete', nth: 1 }, condition: DOMAIN_EXISTS },
	// Wait for the "Set up" button to return, confirming the leftover domain is gone.
	{ type: 'wait', locator: { role: 'button', name: 'Set up' }, state: 'visible', timeoutMs: 30000, condition: DOMAIN_EXISTS },
];

// Reveal the email field (shared by the login-screen tests).
const openEmailForm: Step[] = [
	{ type: 'goto', url: 'http://localhost:3000/' },
	{ type: 'waitForLoadState', state: 'networkidle' },
	{ type: 'click', locator: emailProviderButton },
];

// The reusable login flow's DSL: sign in through the progressive form and prove it
// worked. The two-stage form needs a wait for the password field between the two
// "Sign in" clicks; the trailing waitForUrl + assertNotPresent is the "did login
// actually succeed?" check — if it fails, the capture is marked failed rather than
// storing a bad session.
const loginFlowDsl = {
	steps: [
		...openEmailForm,
		{ type: 'fill', locator: emailField, value: 'emi+test@wonderly.com' },
		{ type: 'click', locator: signInButton },
		{ type: 'wait', locator: passwordField, state: 'visible' },
		{ type: 'fill', locator: passwordField, value: '{{secret.wonderlyPassword}}' },
		{ type: 'click', locator: signInButton },
		{ type: 'waitForUrl', url: '**/web/**' },
		// The authenticated SPA never reaches network idle, so wait for the app
		// shell (a sidebar nav link) instead of waitForLoadState('networkidle').
		{ type: 'wait', locator: { css: 'a[href="/web/calendar"]' }, state: 'visible', timeoutMs: 30000 },
		{ type: 'assertNotPresent', locator: { css: 'input[type="password"]' } },
	],
};

async function main(): Promise<void> {
	// Wipe existing data (children first to respect foreign keys). Keeps org/project/user/api keys.
	await db.delete(tables.stepResult);
	await db.delete(tables.run);
	await db.delete(tables.baseline);
	await db.delete(tables.schedule);
	await db.delete(tables.testVersion);
	await db.delete(tables.test);
	await db.delete(tables.folder);
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
		if (!org) throw new Error('failed to insert org');

		const [p] = await db.insert(tables.project).values({ orgId: org.id, name: 'default' }).returning();
		if (!p) throw new Error('failed to insert project');

		project = p;
		orgId = org.id;
	} else {
		orgId = project.orgId;
	}
	const projectId = project.id;

	// Encrypted password secret, referenced in the login flow as {{secret.wonderlyPassword}}.
	await db.insert(tables.secret).values([{ orgId, name: 'wonderlyPassword', kind: 'password', ref: encrypt('admin123') }]);

	// The reusable login flow. parseTest validates its DSL before persisting.
	parseTest(loginFlowDsl);
	const [flow] = await db.insert(tables.loginFlow).values({ projectId, name: 'Wonderly login', dsl: JSON.stringify(loginFlowDsl) }).returning();
	if (!flow) throw new Error('failed to insert login flow');

	const tests = [
		// ── Login-screen tests (no account needed) ──────────────────────────────
		test('Homepage loads with the welcome screen', [
			{ type: 'goto', url: 'http://localhost:3000/' },
			{ type: 'waitForLoadState', state: 'networkidle' },
			{ type: 'assertText', locator: { css: 'body' }, text: 'Welcome back' },
		]),
		test('Login screen offers every provider', [
			{ type: 'goto', url: 'http://localhost:3000/' },
			{ type: 'waitForLoadState', state: 'networkidle' },
			{ type: 'assertVisible', locator: { role: 'button', name: 'Log in with Google' } },
			{ type: 'assertVisible', locator: { role: 'button', name: 'Log in with Microsoft' } },
			{ type: 'assertVisible', locator: { role: 'button', name: 'Log in with Apple' } },
			{ type: 'assertVisible', locator: { role: 'button', name: 'Log in with phone number' } },
			{ type: 'assertVisible', locator: emailProviderButton },
		]),
		test('Log in with email reveals the email field', [
			...openEmailForm,
			{ type: 'assertVisible', locator: emailField },
			{ type: 'assertVisible', locator: signInButton },
		]),
		test('Valid work email reveals the password step', [
			...openEmailForm,
			{ type: 'fill', locator: emailField, value: 'emi+test@wonderly.com' },
			{ type: 'click', locator: signInButton },
			{ type: 'assertVisible', locator: passwordField },
			{ type: 'assertText', locator: { css: 'body' }, text: 'Forgot your password?' },
		]),
		test('Incomplete email does not advance', [
			...openEmailForm,
			{ type: 'fill', locator: emailField, value: 'not-an-email' },
			{ type: 'assertNotPresent', locator: { css: 'input[type="password"]' } },
			{ type: 'assertVisible', locator: emailField },
		]),

		// ── Realistic example: bound to the login flow, starts already signed in ──
		// No login steps here — the captured session is injected before the first
		// step, so the test opens straight into the authenticated app and browses
		// the CRM. Navigation uses goto because the app renders inside a full-page
		// iframe that occludes the sidebar links from a real click; the session
		// persists across navigations, so each section loads while staying signed
		// in (the password field never reappears).
		//
		// The app is a live SPA whose network never fully idles (polling/sockets),
		// and each navigation shows a "Preparing Wonderly…" splash before the
		// section renders. So after every goto we wait for that section's real
		// content (a heading or control that only appears once it has loaded),
		// not just the URL, so the test proves each view actually rendered.
		test(
			'Browse the CRM as a signed-in user',
			[
				{ type: 'goto', url: 'http://localhost:3000/web/home' },
				// The sidebar shell is in the top document; wait for it first.
				{ type: 'wait', locator: { css: 'a[href="/web/calendar"]' }, state: 'visible', timeoutMs: 30000 },
				// The dashboard content is inside the app iframe, so target it with `frame`.
				{ type: 'wait', locator: { text: 'Welcome back', frame: APP_FRAME }, state: 'visible', timeoutMs: 30000 },
				{ type: 'assertNotPresent', locator: { css: 'input[type="password"]' } },

				// Sales / deals: wait for the pipeline view to render inside the frame.
				{ type: 'goto', url: 'http://localhost:3000/web/crm/records/deals' },
				{ type: 'wait', locator: { css: '[data-testid="crm-add-pipeline-item"]', frame: APP_FRAME }, state: 'visible', timeoutMs: 30000 },
				{ type: 'assertUrl', url: '/web/crm/records/deals' },

				// Calendar: wait for the calendar view control inside the frame.
				{ type: 'goto', url: 'http://localhost:3000/web/calendar' },
				{ type: 'wait', locator: { css: '[data-testid="calendar-view-button"]', frame: APP_FRAME }, state: 'visible', timeoutMs: 30000 },
				{ type: 'assertUrl', url: '/web/calendar' },

				// Back home to confirm the session is still valid at the end.
				{ type: 'goto', url: 'http://localhost:3000/web/home' },
				{ type: 'wait', locator: { text: 'Welcome back', frame: APP_FRAME }, state: 'visible', timeoutMs: 30000 },
				{ type: 'assertNotPresent', locator: { css: 'input[type="password"]' } },
			],
			// Self-heal the SPA/iframe timing flakiness: retry a failing step a couple
			// of times, and re-run the whole test once if it still fails.
			{ loginFlowId: flow.id, stepRetries: 2, stepRetryDelayMs: 2000, retryOnFail: 1, retryDelayMs: 3000 },
		),

		// ── Custom domain lifecycle: add then remove (Website & Ads) ─────────────
		// Bound to the login flow, so it starts signed in. It runs directly against the
		// :3130 app, so the page and its modals are in the top document (no frame). This
		// single test covers the whole lifecycle and ends clean:
		//   0. Cleanup: if a domain is already configured (a prior run failed before its
		//      own delete), remove it first so the test starts from a clean slate. These
		//      steps are conditional, so they are skipped when the section is already clean.
		//   1. Add example.com ("Set up" -> type domain -> "Continue" twice), which
		//      creates it and shows the section as "Connecting" (DNS is then handled
		//      by an external widget, so "Connecting" is the real end state, not a
		//      fully verified "Connected").
		//   2. Delete it: "Delete" opens a "Delete custom domain?" confirmation whose
		//      own "Delete" button is the second match; confirming removes the domain.
		//   3. Verify the "Set up" button returns and no "Delete" control remains.
		// It removes what it added and cleans up any leftover first, so it re-runs cleanly
		// even after an interrupted run.
		test(
			'Add and remove a custom domain in Website & Ads',
			[
				...cleanupExistingDomainSteps,
				...addDomainSteps,
				// Added: the domain shows as "Connecting" (the text appears in several
				// places, header + DNS rows, so target the first match) with a Delete control.
				{ type: 'assertVisible', locator: { text: 'example.com', nth: 0 } },
				{ type: 'assertVisible', locator: { role: 'button', name: 'Delete', nth: 0 } },

				// Now remove it. Open the confirmation from the Custom domain section.
				{ type: 'click', locator: { role: 'button', name: 'Delete', nth: 0 } },
				{ type: 'wait', locator: { text: 'Delete custom domain?' }, state: 'visible', timeoutMs: 15000 },
				// Confirm: the dialog's own "Delete" is the second matching button.
				{ type: 'click', locator: { role: 'button', name: 'Delete', nth: 1 } },
				// Removed: the "Set up" button reappears (a unique signal; "Not connected"
				// also shows for the Facebook/Google sections, so it is not specific) and
				// no Delete control remains.
				{ type: 'wait', locator: { role: 'button', name: 'Set up' }, state: 'visible', timeoutMs: 30000 },
				{ type: 'assertNotPresent', locator: { role: 'button', name: 'Delete' } },
			],
			// Self-heal the SPA/iframe timing flakiness: retry a failing step a couple
			// of times, and re-run the whole test once if it still fails.
			{ loginFlowId: flow.id, stepRetries: 2, stepRetryDelayMs: 2000, retryOnFail: 1, retryDelayMs: 3000 },
		),
	];

	// Validate every DSL against the real schema before persisting.
	for (const t of tests) parseTest({ steps: t.steps });

	for (const t of tests) {
		const [row] = await db
			.insert(tables.test)
			.values({ projectId, name: t.name, settings: t.settings ? JSON.stringify(t.settings) : null })
			.returning();
		if (!row) throw new Error(`failed to insert test "${t.name}"`);

		const [version] = await db.insert(tables.testVersion).values({ testId: row.id, dsl: JSON.stringify({ steps: t.steps }) }).returning();
		if (!version) throw new Error(`failed to insert version for test "${t.name}"`);

		await db.update(tables.test).set({ currentVersionId: version.id }).where(eq(tables.test.id, row.id));
	}

	// Capture the login flow's session now (best-effort; needs the worker running +
	// the Firebase emulator), so the login-bound example works out of the box.
	await runQueue.add('capture', { captureLoginState: flow.id });

	console.log(`seeded ${tests.length} tests, 1 secret, 1 login flow (capturing session…)`);
	// Give the enqueue a moment to flush to Redis before the process exits.
	await new Promise((r) => setTimeout(r, 500));
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
