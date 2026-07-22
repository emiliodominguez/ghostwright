import { db, tables } from '@ghostwright/db';
import { compile, parseTest, type RunContext, type StepExpect, type StepPage } from '@ghostwright/dsl';
import { createLogger } from '@ghostwright/otel/logger';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright-core';
import { decrypt, encrypt } from '@ghostwright/crypto';
import { loadPasswordSecrets, totpCodeForSecret } from './secrets';
import { makeVarStore } from './variables';

const log = createLogger('worker.login');

/**
 * Run a login flow's DSL in a fresh browser and capture the resulting session
 * (cookies + localStorage + IndexedDB) as an encrypted blob on the flow row.
 *
 * @param loginFlowId - the login flow to (re)capture.
 * @returns the login flow id.
 */
export async function captureLoginState(loginFlowId: string): Promise<string> {
	const flow = await db.query.loginFlow.findFirst({ where: eq(tables.loginFlow.id, loginFlowId) });
	if (!flow) throw new Error(`login_flow ${loginFlowId} not found`);
	const project = await db.query.project.findFirst({ where: eq(tables.project.id, flow.projectId) });
	const orgId = project?.orgId ?? '';
	const dsl = parseTest(JSON.parse(flow.dsl));

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();
	const stepExpect: StepExpect = (target) => expect(target as never) as never;
	const { vars, resolveVar } = makeVarStore();
	if (orgId) Object.assign(vars, await loadPasswordSecrets(orgId));
	const ctx: RunContext = { expect: stepExpect, vars, resolveVar, totp: (name) => totpCodeForSecret(orgId, name) };

	try {
		// A failing step (e.g. a final "assert logged-in" check) marks the capture failed —
		// this is how we verify the login actually worked rather than storing a bad session.
		for (const step of dsl.steps.map(compile)) {
			await step.run(page as unknown as StepPage, ctx);
		}
		// indexedDB:true captures token stores used by e.g. Firebase-style auth (v1.51+).
		const state = await context.storageState({ indexedDB: true });
		const cookieCount = state.cookies.length;
		const captureError = cookieCount === 0 ? 'login produced no cookies — did the login actually succeed?' : null;
		await db
			.update(tables.loginFlow)
			.set({ storageStateRef: encrypt(JSON.stringify(state)), lastCapturedAt: new Date(), lastCaptureError: captureError, cookieCount })
			.where(eq(tables.loginFlow.id, loginFlowId));
		log.info({ loginFlowId, cookies: cookieCount }, 'login state captured');
		return loginFlowId;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db.update(tables.loginFlow).set({ lastCapturedAt: new Date(), lastCaptureError: message, cookieCount: 0 }).where(eq(tables.loginFlow.id, loginFlowId));
		log.warn({ loginFlowId, err: message }, 'login capture failed');
		return loginFlowId;
	} finally {
		await context.close();
		await browser.close();
	}
}

/**
 * Load and decrypt a login flow's captured session.
 *
 * @param loginFlowId - the login flow.
 * @returns the storageState JSON string, or undefined if not captured yet.
 */
export async function loadLoginState(loginFlowId: string): Promise<string | undefined> {
	const flow = await db.query.loginFlow.findFirst({ where: eq(tables.loginFlow.id, loginFlowId) });
	if (!flow?.storageStateRef) return undefined;
	return decrypt(flow.storageStateRef);
}
