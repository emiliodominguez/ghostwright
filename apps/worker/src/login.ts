import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, tables } from '@ghostwright/db';
import { uploadFile } from '@ghostwright/artifacts';
import { compile, parseTest, type RunContext, type StepExpect, type StepPage } from '@ghostwright/dsl';
import { createLogger } from '@ghostwright/logger';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright-core';
import { decrypt, encrypt } from '@ghostwright/crypto';
import { loadPasswordSecrets, totpCodeForSecret } from './secrets';
import { makeVarStore } from './variables';

const log = createLogger('worker.login');

/** Upload an artifact, swallowing failures so a bad upload never fails the capture. */
async function tryUpload(key: string, path: string, contentType: string): Promise<string | undefined> {
	try {
		return await uploadFile(key, path, contentType);
	} catch (err) {
		log.warn({ key, err: err instanceof Error ? err.message : String(err) }, 'capture artifact upload skipped');
		return undefined;
	}
}

/**
 * Run a login flow's DSL in a fresh browser and capture the resulting session
 * (cookies + localStorage + IndexedDB) as an encrypted blob on the flow row.
 *
 * The attempt is recorded as a `capture_run` — per-step results, a Playwright trace,
 * per-step screenshots, and a video — so a failed capture is debuggable the same way
 * a test run is. The flow's own capture-status fields (lastCaptureError, cookieCount)
 * are also updated, since the Logins list reads those.
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

	// Record the attempt up front so it shows as "running" while it runs.
	const [captureRun] = await db.insert(tables.captureRun).values({ loginFlowId, status: 'running', startedAt: new Date() }).returning();
	if (!captureRun) throw new Error('failed to create capture_run row');
	const captureRunId = captureRun.id;

	const workDir = await mkdtemp(join(tmpdir(), 'gw-capture-'));
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({ recordVideo: { dir: join(workDir, 'video') } });
	await context.tracing.start({ screenshots: true, snapshots: true, sources: true, title: captureRunId });
	const page = await context.newPage();
	const video = page.video();

	const stepExpect: StepExpect = (target) => expect(target as never) as never;
	const { vars, resolveVar } = makeVarStore();
	if (orgId) Object.assign(vars, await loadPasswordSecrets(orgId));
	const ctx: RunContext = { expect: stepExpect, vars, resolveVar, totp: (name) => totpCodeForSecret(orgId, name) };

	// Redact secret values (and strip Playwright's ANSI "Call log" codes) from any error
	// we persist, exactly as the test runner does.
	const secretValues = Object.entries(vars)
		.filter(([k]) => k.startsWith('secret.'))
		.map(([, v]) => v)
		.filter((v) => v.length >= 4);
	// eslint-disable-next-line no-control-regex
	const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
	const redact = (s: string | undefined): string | undefined => (s ? stripAnsi(secretValues.reduce((acc, v) => acc.split(v).join('***'), s)) : s);

	let status: 'passed' | 'failed' = 'passed';
	let runError: string | undefined;

	try {
		const compiled = dsl.steps.map(compile);
		for (let i = 0; i < compiled.length; i++) {
			const step = compiled[i];
			if (!step) continue;
			const startedAt = Date.now();
			let stepStatus: 'passed' | 'failed' = 'passed';
			let stepError: string | undefined;

			try {
				await step.run(page as unknown as StepPage, ctx);
			} catch (err) {
				stepStatus = 'failed';
				stepError = err instanceof Error ? err.message : String(err);
				status = 'failed';
				runError = stepError;
			}

			// Per-step screenshot (best-effort): capture to a temp file, then upload.
			let screenshotKey: string | undefined;
			try {
				const shotPath = join(workDir, `step-${i}.png`);
				await page.screenshot({ path: shotPath });
				screenshotKey = await tryUpload(`captures/${captureRunId}/steps/${i}.png`, shotPath, 'image/png');
			} catch {
				// best-effort
			}

			await db.insert(tables.captureStep).values({
				captureRunId,
				idx: i,
				type: step.type,
				status: stepStatus,
				durationMs: Date.now() - startedAt,
				screenshotKey,
				error: redact(stepError),
			});

			if (stepStatus === 'failed') break;
		}

		// Only capture the session if every step passed — a failed flow (e.g. a final
		// "assert logged-in" check) must not store a bad session.
		let cookieCount = 0;
		if (status === 'passed') {
			// indexedDB:true captures token stores used by e.g. Firebase-style auth (v1.51+).
			const state = await context.storageState({ indexedDB: true });
			cookieCount = state.cookies.length;
			if (cookieCount === 0) {
				status = 'failed';
				runError = 'Login produced no cookies. Did the login actually succeed?';
			} else {
				await db.update(tables.loginFlow).set({ storageStateRef: encrypt(JSON.stringify(state)) }).where(eq(tables.loginFlow.id, loginFlowId));
			}
		}

		// Flush + upload artifacts (video/trace finalize on context.close()).
		const finalShot = join(workDir, 'final.png');
		await page.screenshot({ path: finalShot, fullPage: true }).catch(() => {});
		await context.tracing.stop({ path: join(workDir, 'trace.zip') });
		const videoPath = await video?.path().catch(() => undefined);
		await context.close();

		const traceKey = await tryUpload(`captures/${captureRunId}/trace.zip`, join(workDir, 'trace.zip'), 'application/zip');
		const screenshotKey = await tryUpload(`captures/${captureRunId}/final.png`, finalShot, 'image/png');
		const videoKey = videoPath ? await tryUpload(`captures/${captureRunId}/video.webm`, videoPath, 'video/webm') : undefined;

		await db
			.update(tables.captureRun)
			.set({ status, cookieCount, error: redact(runError), traceKey, screenshotKey, videoKey, finishedAt: new Date() })
			.where(eq(tables.captureRun.id, captureRunId));
		// Keep the flow's own status fields in sync (the Logins list reads these).
		await db
			.update(tables.loginFlow)
			.set({ lastCapturedAt: new Date(), lastCaptureError: redact(runError) ?? null, cookieCount })
			.where(eq(tables.loginFlow.id, loginFlowId));

		log.info({ loginFlowId, captureRunId, status, cookies: cookieCount }, 'login capture finished');
		return loginFlowId;
	} catch (err) {
		// An unexpected failure (browser crash, storageState error) — record it and move on.
		const message = redact(err instanceof Error ? err.message : String(err));
		await context.close().catch(() => {});
		await db.update(tables.captureRun).set({ status: 'errored', error: message, finishedAt: new Date() }).where(eq(tables.captureRun.id, captureRunId));
		await db.update(tables.loginFlow).set({ lastCapturedAt: new Date(), lastCaptureError: message ?? null, cookieCount: 0 }).where(eq(tables.loginFlow.id, loginFlowId));
		log.warn({ loginFlowId, captureRunId, err: message }, 'login capture failed');
		return loginFlowId;
	} finally {
		await browser.close().catch(() => {});
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
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
