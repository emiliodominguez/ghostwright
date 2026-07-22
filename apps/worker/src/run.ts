import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiEnabled, resolveStep, triageFailure } from '@ghostwright/ai';
import { putObject, uploadFile } from '@ghostwright/artifacts';
import { db, tables } from '@ghostwright/db';
import {
	compile,
	ExitTest,
	expandActions,
	parseSettings,
	parseTest,
	resolveLocator,
	type RunContext,
	type StepExpect,
	type StepLocator,
	type StepPage,
	type Test,
	type TestSettings,
} from '@ghostwright/dsl';
import { writeFile } from 'node:fs/promises';
import { createLogger } from '@ghostwright/otel/logger';
import { recordRun, withRunSpan, withStepSpan } from '@ghostwright/otel';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { chromium, firefox, webkit } from 'playwright-core';

const ENGINES = { chromium, firefox, webkit };
import type { RunJob } from '@ghostwright/queue';
import { dispatchAlerts } from './alerts';
import { captureLoginState, loadLoginState } from './login';
import { assertUrlAllowed } from './net-guard';
import { loadPasswordSecrets, totpCodeForSecret } from './secrets';
import { makeVarStore } from './variables';
import { makeVisualSink, type VisualOutcome } from './visual';

const log = createLogger('worker.run');

type RunStatus = 'passed' | 'failed' | 'errored';
type StepStatus = 'passed' | 'failed' | 'skipped';

function parseViewport(v: string): { width: number; height: number } {
	const [w, h] = v.split('x').map(Number);
	return { width: w || 1280, height: h || 720 };
}

/** Load a saved action's steps for expansion, or null if it's gone. */
async function loadActionSteps(actionId: string) {
	const a = await db.query.action.findFirst({ where: eq(tables.action.id, actionId) });
	return a ? parseTest(JSON.parse(a.dsl)).steps : null;
}

/** Resolve an upload reference to a local path: download http(s) URLs, pass paths through. */
async function resolveUploadFile(ref: string, workDir: string): Promise<string> {
	if (!/^https?:\/\//i.test(ref)) return ref;
	assertUrlAllowed(ref);
	const res = await fetch(ref);
	if (!res.ok) throw new Error(`upload fetch failed (${res.status}) for ${ref}`);
	const name = ref.split('/').pop()?.split('?')[0] || 'upload.bin';
	const dest = join(workDir, `upload-${Date.now()}-${name}`);
	await writeFile(dest, Buffer.from(await res.arrayBuffer()));
	return dest;
}

async function tryUpload(key: string, path: string, contentType: string): Promise<string | undefined> {
	try {
		return await uploadFile(key, path, contentType);
	} catch (err) {
		log.warn({ key, err: err instanceof Error ? err.message : String(err) }, 'artifact upload skipped');
		return undefined;
	}
}

interface AttemptResult {
	runId: string;
	status: RunStatus;
	error?: string;
	finalUrl: string;
	traceKey?: string;
	harKey?: string;
	videoKey?: string;
	screenshotKey?: string;
}

/**
 * Execute a run, optionally injecting a login flow's captured session and
 * re-authenticating once if the run looks like it hit a login wall.
 *
 * @param job - the run request.
 * @returns the created run id.
 */
export async function executeRun(job: RunJob): Promise<string> {
	try {
		return await executeRunInner(job);
	} catch (err) {
		// Any failure before/around the attempt (bad DSL, missing version, corrupt session, launch/teardown
		// throw) must still finalize the pre-created run row so it never wedges in queued/running.
		const message = err instanceof Error ? err.message : String(err);
		log.error({ runId: job.runId, err: message }, 'run failed to execute');
		if (job.runId) {
			await db
				.update(tables.run)
				.set({ status: 'errored', error: message, finishedAt: new Date() })
				.where(eq(tables.run.id, job.runId))
				.catch(() => {});
			recordRun('errored');
		}
		throw err;
	}
}

async function executeRunInner(job: RunJob): Promise<string> {
	let testVersionId = job.testVersionId;
	if (!testVersionId && job.testId) {
		const t = await db.query.test.findFirst({ where: eq(tables.test.id, job.testId) });
		if (!t?.currentVersionId) throw new Error(`test ${job.testId} has no current version`);
		testVersionId = t.currentVersionId;
	}
	if (!testVersionId) throw new Error('run job needs testVersionId or testId');

	const tv = await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, testVersionId) });
	if (!tv) throw new Error(`test_version ${testVersionId} not found`);
	const test = await db.query.test.findFirst({ where: eq(tables.test.id, tv.testId) });
	const project = test && (await db.query.project.findFirst({ where: eq(tables.project.id, test.projectId) }));
	const orgId = project?.orgId ?? '';
	const rawParsed = parseTest(JSON.parse(tv.dsl));
	// Expand live action references to their current steps (edits to an action propagate here).
	const parsed = { steps: await expandActions(rawParsed.steps, loadActionSteps) };
	const settings = parseSettings(test?.settings);

	// First attempt (inject captured login state if a login flow is bound).
	let storageState = job.loginFlowId ? await loadLoginState(job.loginFlowId) : undefined;
	let attempt = await runAttempt(job, testVersionId, tv.testId, orgId, parsed, settings, job.runId, storageState);

	// Re-auth: if we failed and landed on a login page, refresh the session and retry once.
	// The run row stays "running" across this so watchers don't see the transient failure.
	if (attempt.status === 'failed' && job.loginFlowId && /\b(log[-\s]?in|sign[-\s]?in|sso|oauth|authenticate|session[-\s]?expired)\b/i.test(attempt.finalUrl)) {
		log.info({ loginFlowId: job.loginFlowId }, 're-authenticating after login redirect');
		await captureLoginState(job.loginFlowId);
		storageState = await loadLoginState(job.loginFlowId);
		attempt = await runAttempt(job, testVersionId, tv.testId, orgId, parsed, settings, attempt.runId, storageState);
	}

	// Auto-retry once on failure (cuts false positives) when the test opts in.
	if (attempt.status === 'failed' && settings.retry) {
		log.info({ runId: attempt.runId }, 'auto-retrying failed run once');
		attempt = await runAttempt(job, testVersionId, tv.testId, orgId, parsed, settings, attempt.runId, storageState);
	}

	// Finalize the run row exactly once, then fire alerts.
	await db
		.update(tables.run)
		.set({
			status: attempt.status,
			error: attempt.error,
			traceKey: attempt.traceKey,
			harKey: attempt.harKey,
			videoKey: attempt.videoKey,
			screenshotKey: attempt.screenshotKey,
			finishedAt: new Date(),
		})
		.where(eq(tables.run.id, attempt.runId));
	await dispatchAlerts(attempt.runId, testVersionId, attempt.status, attempt.error);
	recordRun(attempt.status);

	// Best-effort AI triage on failure — never blocks the verdict (already written above).
	if ((attempt.status === 'failed' || attempt.status === 'errored') && aiEnabled()) {
		const steps = await db.select().from(tables.stepResult).where(eq(tables.stepResult.runId, attempt.runId)).orderBy(tables.stepResult.idx);
		const triage = await triageFailure({
			testName: test?.name ?? 'test',
			error: attempt.error ?? '',
			steps: steps.map((s) => ({ idx: s.idx, type: s.type, status: s.status, error: s.error })),
		});
		if (triage) await db.update(tables.run).set({ triage: JSON.stringify(triage) }).where(eq(tables.run.id, attempt.runId));
	}
	return attempt.runId;
}

/** One browser attempt: run every step, capture artifacts, persist the run + steps. */
async function runAttempt(
	job: RunJob,
	testVersionId: string,
	testId: string,
	orgId: string,
	testDsl: Test,
	settings: TestSettings,
	existingRunId: string | undefined,
	storageState: string | undefined,
): Promise<AttemptResult & { runId: string }> {
	const viewport = parseViewport(settings.viewport ?? job.viewport ?? '1280x720');
	const browserName = job.browser ?? 'chromium';
	const engine = ENGINES[browserName as keyof typeof ENGINES];
	if (!engine) return { runId: existingRunId ?? '', status: 'errored', error: `unknown browser "${browserName}"`, finalUrl: '' };

	let runId: string;
	if (existingRunId) {
		await db.update(tables.run).set({ status: 'running', browser: browserName, startedAt: new Date() }).where(eq(tables.run.id, existingRunId));
		// Clear any prior step rows (e.g. a failed attempt before re-auth) so the row reflects this attempt.
		await db.delete(tables.stepResult).where(eq(tables.stepResult.runId, existingRunId));
		runId = existingRunId;
	} else {
		const [row] = await db
			.insert(tables.run)
			.values({ testVersionId, status: 'running', browser: browserName, viewport: job.viewport ?? '1280x720', startedAt: new Date() })
			.returning();
		runId = row.id;
	}
	log.info({ runId, browser: browserName, steps: testDsl.steps.length, authed: Boolean(storageState) }, 'run started');

	const workDir = await mkdtemp(join(tmpdir(), 'gw-run-'));
	let browser;
	try {
		browser = await engine.launch({ headless: true });
	} catch (err) {
		// e.g. the browser binary isn't installed — fail this run cleanly instead of hanging.
		const message = `failed to launch ${browserName}: ${err instanceof Error ? err.message : String(err)}`;
		await rm(workDir, { recursive: true, force: true });
		return { runId, status: 'errored', error: message, finalUrl: '' };
	}
	// Accept-Language defaults from `language` unless the user set the header explicitly.
	const headers = {
		...(settings.language ? { 'Accept-Language': settings.language } : {}),
		...(settings.headers ?? {}),
	};
	// Don't record request/response bodies to a downloadable HAR when the run handles
	// credentials — a login POST body would otherwise persist the password in plaintext.
	const sensitive = Boolean(job.loginFlowId) || JSON.stringify(testDsl).includes('{{secret.');

	let status: RunStatus = 'passed';
	let runError: string | undefined;

	try {
		const context = await browser.newContext({
			viewport,
			recordVideo: { dir: join(workDir, 'video') },
			...(sensitive ? {} : { recordHar: { path: join(workDir, 'run.har.zip'), content: 'attach' as const, mode: 'full' as const } }),
			...(settings.userAgent ? { userAgent: settings.userAgent } : {}),
			...(settings.language ? { locale: settings.language } : {}),
			...(settings.basicAuth ? { httpCredentials: settings.basicAuth } : {}),
			...(Object.keys(headers).length ? { extraHTTPHeaders: headers } : {}),
			...(storageState ? { storageState: JSON.parse(storageState) } : {}),
		});
		if (settings.elementTimeoutMs) context.setDefaultTimeout(settings.elementTimeoutMs);
		await context.tracing.start({ screenshots: true, snapshots: true, sources: true, title: runId });
		const page = await context.newPage();
		const video = page.video();

		// Fail the run on an uncaught page JS error when the test opts in.
		const jsErrors: string[] = [];
		if (settings.failOnJsError) page.on('pageerror', (e) => jsErrors.push(e.message));

		const stepExpect: StepExpect = (target) => expect(target as never) as never;
		const pendingVisual: { current?: VisualOutcome } = {};
		const { vars, resolveVar } = makeVarStore();
		// Seed data-driven row variables first, then password secrets — so a CSV column can
		// never shadow a real `secret.*` value (secrets always win).
		if (job.vars) Object.assign(vars, job.vars);
		if (orgId) Object.assign(vars, await loadPasswordSecrets(orgId));
		const ctx: RunContext = {
			expect: stepExpect,
			baseUrl: job.baseUrl,
			vars,
			resolveVar,
			onVisualCheck: makeVisualSink({ testId, browser: browserName, viewport: settings.viewport ?? job.viewport ?? '1280x720', runId, workDir, pending: pendingVisual }),
			totp: (name) => totpCodeForSecret(orgId, name),
			resolveFile: (ref) => resolveUploadFile(ref, workDir),
			ai: async (instruction, sp) => {
				// _snapshotForAI (ref-decorated, as @playwright/mcp uses) with ariaSnapshot fallback.
				const pw = sp as unknown as { _snapshotForAI?: () => Promise<string>; locator: (s: string) => { ariaSnapshot: () => Promise<string> } };
				const snapshot = (await pw._snapshotForAI?.()) ?? (await pw.locator('body').ariaSnapshot());
				const loc = await resolveStep(snapshot, instruction);
				if (!loc) throw new Error(`AI could not resolve instruction: ${instruction}`);
				return resolveLocator(sp, loc) as StepLocator;
			},
		};

		// Redact secret values from any error we persist/export/alert (e.g. an assertText whose
		// expected string was `{{secret.X}}` echoes the secret in the expect() failure message).
		const secretValues = Object.entries(vars)
			.filter(([k]) => k.startsWith('secret.'))
			.map(([, v]) => v)
			.filter((v) => v.length >= 4);
		const redact = (s: string | undefined): string | undefined => (s ? secretValues.reduce((acc, v) => acc.split(v).join('***'), s) : s);

		const compiled = testDsl.steps.map(compile);
		await withRunSpan(runId, async () => {
		let stop = false;
		for (let i = 0; i < compiled.length; i++) {
		const step = compiled[i];
		const startedAt = Date.now();
		let stepStatus: StepStatus = 'passed';
		let stepError: string | undefined;

		// Conditional step: skip (and mark skipped) when the condition is falsy or errors.
		let willRun = true;
		if (step.shouldRun) {
			try {
				willRun = await step.shouldRun(page as unknown as StepPage, ctx);
			} catch {
				willRun = false;
			}
		}

		if (!willRun) {
			stepStatus = 'skipped';
		} else {
			try {
				await withStepSpan({ runId, idx: i, type: step.type }, () => step.run(page as unknown as StepPage, ctx));
			} catch (err) {
				if (err instanceof ExitTest) {
					// Early exit: the run's verdict is set by the exit step; stop cleanly.
					stepStatus = err.pass ? 'passed' : 'failed';
					if (!err.pass) {
						status = 'failed';
						runError = 'test exited with a failing status';
					}
					stop = true;
				} else {
					stepStatus = 'failed';
					stepError = err instanceof Error ? err.message : String(err);
					status = 'failed';
					runError = stepError;
				}
			}
		}

		let screenshotKey: string | undefined;
		try {
			screenshotKey = await putObject(`runs/${runId}/steps/${i}.png`, await page.screenshot(), 'image/png');
		} catch {
			// best-effort
		}

		const visual = pendingVisual.current;
		pendingVisual.current = undefined;
		await db.insert(tables.stepResult).values({
			runId,
			idx: i,
			type: step.type,
			status: stepStatus,
			durationMs: Date.now() - startedAt,
			screenshotKey: visual?.actualKey ?? screenshotKey,
			baselineKey: visual?.baselineKey,
			diffKey: visual?.diffKey,
			diffPct: visual?.diffPct,
			error: redact(stepError),
		});

			if (settings.stepDelayMs) await page.waitForTimeout(settings.stepDelayMs);
			if (stepStatus === 'failed' || stop) break;
		}
		});

		// A page JS error fails an otherwise-passing run when fail-on-JS-error is set.
		if (status === 'passed' && jsErrors.length > 0) {
			status = 'failed';
			runError = `page JS error: ${jsErrors[0]}`;
		}

		const finalUrl = page.url();
		let screenshotKey: string | undefined;
		try {
			screenshotKey = await putObject(`runs/${runId}/final.png`, await page.screenshot({ fullPage: true }), 'image/png');
		} catch {
			// ignore
		}

		// Flush artifacts to disk (HAR/video finalize on context.close) before uploading.
		await context.tracing.stop({ path: join(workDir, 'trace.zip') });
		await context.close();

		const traceKey = await tryUpload(`runs/${runId}/trace.zip`, join(workDir, 'trace.zip'), 'application/zip');
		const harKey = sensitive ? undefined : await tryUpload(`runs/${runId}/run.har.zip`, join(workDir, 'run.har.zip'), 'application/zip');
		const videoPath = await video?.path().catch(() => undefined);
		const videoKey = videoPath ? await tryUpload(`runs/${runId}/video.webm`, videoPath, 'video/webm') : undefined;

		// A best-effort artifact upload failing must NOT flip a real verdict — just note it.
		if (status === 'passed' && !traceKey) log.warn({ runId }, 'trace upload failed (verdict unchanged)');

		log.info({ runId, status, traceKey }, 'attempt complete');
		// The run row is finalized by executeRun (once), so a re-auth retry doesn't flash a failed status.
		return { runId, status, error: redact(runError), finalUrl, traceKey, harKey, videoKey, screenshotKey };
	} finally {
		// Always release the browser and temp dir, even if context creation / a step / teardown threw.
		await browser.close().catch(() => {});
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
	}
}
