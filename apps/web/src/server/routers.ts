import { copyObject, deletePrefix } from '@ghostwright/artifacts';
import { encrypt } from '@ghostwright/crypto';
import { db, tables } from '@ghostwright/db';
import { describeSegments, describeStep, expandActions, parseTest, testSettingsSchema, DISABLED_BROWSERS, type DescSegment, type Step } from '@ghostwright/dsl';
import { runQueue, type RunJob } from '@ghostwright/queue';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { parseDataRows } from './dataRows';
import { publicProcedure, router } from './trpc';

/** Validate a test-DSL string, surfacing malformed input as a 400 (not a 500). */
function validateDsl(dsl: string): void {
	try {
		parseTest(JSON.parse(dsl));
	} catch (e) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: `invalid test DSL: ${e instanceof Error ? e.message : String(e)}` });
	}
}

/** Load a saved action's steps, for expanding live `actionRef` references. */
async function loadActionSteps(actionId: string): Promise<Step[] | null> {
	const a = await db.query.action.findFirst({ where: eq(tables.action.id, actionId) });
	return a ? parseTest(JSON.parse(a.dsl)).steps : null;
}

/** Expand a test's DSL and describe every concrete step, in plain language. */
export async function describeExpanded(dsl: string): Promise<string[]> {
	try {
		const steps = await expandActions(parseTest(JSON.parse(dsl)).steps, loadActionSteps);
		return steps.map(describeStep);
	} catch {
		return [];
	}
}

/**
 * Expand a test's DSL and describe every concrete step as styled segments (for the UI).
 * Resilient by design: only a parse/expand failure yields an empty list; a single step
 * that can't be turned into segments falls back to a plain-text segment so the step still
 * shows (a step must never silently vanish and read as "No steps").
 */
export async function describeExpandedSegments(dsl: string): Promise<DescSegment[][]> {
	let steps: Step[];
	try {
		steps = await expandActions(parseTest(JSON.parse(dsl)).steps, loadActionSteps);
	} catch {
		return [];
	}

	return steps.map((step) => {
		try {
			const segs = describeSegments(step);
			if (segs && segs.length > 0) return segs;
		} catch {
			/* fall through to the plain-text fallback below */
		}

		return [{ kind: 'text', text: describeStep(step) }];
	});
}

// Data-driven input parsing lives in ./dataRows so it can be unit-tested without the
// database/queue graph this module pulls in. Re-exported for existing importers.
export { parseDataRows };

/** Ensure a default org+project exists so tests can be created without setup. */
async function ensureDefaultProject(): Promise<string> {
	const existing = await db.query.project.findFirst();
	if (existing) return existing.id;
	const [org] = await db.insert(tables.org).values({ name: 'default' }).returning();
	const [project] = await db.insert(tables.project).values({ orgId: org.id, name: 'default' }).returning();
	return project.id;
}

/** Ensure a default org exists and return its id (secrets are org-scoped). */
async function ensureDefaultOrg(): Promise<string> {
	const existing = await db.query.org.findFirst();
	if (existing) return existing.id;
	const [org] = await db.insert(tables.org).values({ name: 'default' }).returning();
	return org.id;
}

/**
 * Enqueue runs for one test: a run per browser × data row. Drops any temporarily
 * disabled engine (e.g. WebKit) a test's saved settings still reference, falling
 * back to chromium if that leaves nothing, and logs in first via the test's bound
 * login flow (or an explicit override).
 *
 * @param testId - the test to run.
 * @param viewport - viewport size string, e.g. "1280x720".
 * @param baseUrl - optional base URL override for the run.
 * @param loginFlowIdOverride - optional login flow to use instead of the test's own.
 * @returns the ids of the created run rows.
 */
async function enqueueTestRuns(testId: string, viewport: string, baseUrl?: string, loginFlowIdOverride?: string): Promise<string[]> {
	const test = await db.query.test.findFirst({ where: eq(tables.test.id, testId) });
	if (!test?.currentVersionId) throw new Error('test has no current version');
	const versionId = test.currentVersionId;

	// Data-driven: one run per row, each seeded with the row's columns as variables.
	const rows = test.dataJson ? (JSON.parse(test.dataJson) as Record<string, string>[]) : [];
	const batches = rows.length > 0 ? rows : [undefined];

	const settings = test.settings ? (JSON.parse(test.settings) as { browsers?: string[]; loginFlowId?: string }) : {};
	const requested = settings.browsers?.length ? settings.browsers : ['chromium'];
	const disabled: readonly string[] = DISABLED_BROWSERS ?? [];
	const browsers = requested.filter((b) => !disabled.includes(b));
	if (browsers.length === 0) browsers.push('chromium');

	const loginFlowId = loginFlowIdOverride ?? settings.loginFlowId;
	const ids: string[] = [];

	for (const browser of browsers) {
		for (const vars of batches) {
			const [run] = await db
				.insert(tables.run)
				.values({ testVersionId: versionId, status: 'queued', browser, viewport })
				.returning();

			const job: RunJob = { runId: run.id, testVersionId: versionId, viewport, baseUrl, loginFlowId, browser, vars };
			await runQueue.add('run', job);
			ids.push(run.id);
		}
	}

	return ids;
}

export const appRouter = router({
	tests: router({
		list: publicProcedure.query(async () => {
			const tests = await db.select().from(tables.test).orderBy(desc(tables.test.createdAt));
			if (tests.length === 0) return [];

			// Annotate each test with the status of its most recent run, so the list can
			// show a last-run indicator. Runs hang off test versions, so we map every
			// version back to its test, then take the newest run per test.
			const versions = await db.select({ id: tables.testVersion.id, testId: tables.testVersion.testId }).from(tables.testVersion);
			const testIdByVersion = new Map(versions.map((v) => [v.id, v.testId]));
			const versionIds = versions.map((v) => v.id);

			const lastStatusByTest = new Map<string, string>();
			if (versionIds.length) {
				// Newest first; the first row we see per test is its latest run.
				const runs = await db
					.select({ status: tables.run.status, testVersionId: tables.run.testVersionId })
					.from(tables.run)
					.where(inArray(tables.run.testVersionId, versionIds))
					.orderBy(desc(tables.run.createdAt));

				for (const r of runs) {
					const testId = testIdByVersion.get(r.testVersionId);
					if (testId && !lastStatusByTest.has(testId)) lastStatusByTest.set(testId, r.status);
				}
			}

			return tests.map((t) => ({ ...t, lastStatus: lastStatusByTest.get(t.id) ?? null }));
		}),

		get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
			const test = await db.query.test.findFirst({ where: eq(tables.test.id, input.id) });
			if (!test) return null;
			const version = test.currentVersionId
				? await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, test.currentVersionId) })
				: null;
			return { test, version };
		}),

		create: publicProcedure
			.input(z.object({ name: z.string().min(1), dsl: z.string() }))
			.mutation(async ({ input }) => {
				// Validate the DSL before persisting — reject malformed tests at the boundary.
				validateDsl(input.dsl);
				const projectId = await ensureDefaultProject();
				const [test] = await db.insert(tables.test).values({ projectId, name: input.name }).returning();
				const [version] = await db.insert(tables.testVersion).values({ testId: test.id, dsl: input.dsl }).returning();
				await db.update(tables.test).set({ currentVersionId: version.id }).where(eq(tables.test.id, test.id));
				return { id: test.id };
			}),

		updateSettings: publicProcedure
			.input(z.object({ id: z.string(), settings: testSettingsSchema }))
			.mutation(async ({ input }) => {
				await db.update(tables.test).set({ settings: JSON.stringify(input.settings) }).where(eq(tables.test.id, input.id));
				return { ok: true };
			}),

		// Edit a test's name and/or steps. Editing the steps creates a NEW immutable
		// version and points the test at it (like `create`), so past runs keep their
		// own version and history stays intact.
		update: publicProcedure
			.input(z.object({ id: z.string(), name: z.string().min(1).optional(), dsl: z.string().optional() }))
			.mutation(async ({ input }) => {
				const test = await db.query.test.findFirst({ where: eq(tables.test.id, input.id) });
				if (!test) throw new TRPCError({ code: 'NOT_FOUND', message: 'test not found' });
				if (input.name) await db.update(tables.test).set({ name: input.name }).where(eq(tables.test.id, input.id));
				if (input.dsl) {
					validateDsl(input.dsl);
					const [version] = await db.insert(tables.testVersion).values({ testId: input.id, dsl: input.dsl }).returning();
					await db.update(tables.test).set({ currentVersionId: version.id }).where(eq(tables.test.id, input.id));
				}
				return { ok: true };
			}),

		// Delete a test and everything hanging off it (runs, step results, versions, schedules, baselines).
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			const versions = await db.select({ id: tables.testVersion.id }).from(tables.testVersion).where(eq(tables.testVersion.testId, input.id));
			const versionIds = versions.map((v) => v.id);
			if (versionIds.length) {
				const runs = await db.select({ id: tables.run.id }).from(tables.run).where(inArray(tables.run.testVersionId, versionIds));
				const runIds = runs.map((r) => r.id);
				if (runIds.length) await db.delete(tables.stepResult).where(inArray(tables.stepResult.runId, runIds));
				await db.delete(tables.run).where(inArray(tables.run.testVersionId, versionIds));
			}
			await db.delete(tables.baseline).where(eq(tables.baseline.testId, input.id));
			await db.delete(tables.schedule).where(eq(tables.schedule.testId, input.id));
			await db.update(tables.test).set({ currentVersionId: null }).where(eq(tables.test.id, input.id));
			await db.delete(tables.testVersion).where(eq(tables.testVersion.testId, input.id));
			await db.delete(tables.test).where(eq(tables.test.id, input.id));
			return { ok: true };
		}),

		// Move a test into a folder (null = top level / unfiled).
		move: publicProcedure.input(z.object({ id: z.string(), folderId: z.string().nullable() })).mutation(async ({ input }) => {
			await db.update(tables.test).set({ folderId: input.folderId }).where(eq(tables.test.id, input.id));
			return { ok: true };
		}),

		// Attach data-driven rows from pasted CSV (headers on row 1) or a JSON array; empty clears it.
		setData: publicProcedure.input(z.object({ id: z.string(), text: z.string() })).mutation(async ({ input }) => {
			let rows: Record<string, string>[];
			try {
				rows = parseDataRows(input.text);
			} catch (e) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'invalid data' });
			}
			await db.update(tables.test).set({ dataJson: rows.length ? JSON.stringify(rows) : null }).where(eq(tables.test.id, input.id));
			return { rows: rows.length };
		}),
	}),

	folders: router({
		// All folders in the default project (the client assembles the tree from parentId).
		list: publicProcedure.query(async () => {
			const projectId = await ensureDefaultProject();
			return db.select().from(tables.folder).where(eq(tables.folder.projectId, projectId)).orderBy(tables.folder.name);
		}),
		create: publicProcedure
			.input(z.object({ name: z.string().min(1), parentId: z.string().nullable().optional() }))
			.mutation(async ({ input }) => {
				const projectId = await ensureDefaultProject();
				const [row] = await db.insert(tables.folder).values({ projectId, name: input.name, parentId: input.parentId ?? null }).returning();
				return { id: row.id };
			}),
		rename: publicProcedure.input(z.object({ id: z.string(), name: z.string().min(1) })).mutation(async ({ input }) => {
			await db.update(tables.folder).set({ name: input.name }).where(eq(tables.folder.id, input.id));
			return { ok: true };
		}),
		// Persist a folder's collapsed/expanded state so the tree renders the same way on
		// reload (resolved server-side during SSR, so there's no expand/collapse flicker).
		setCollapsed: publicProcedure.input(z.object({ id: z.string(), collapsed: z.boolean() })).mutation(async ({ input }) => {
			await db.update(tables.folder).set({ collapsed: input.collapsed }).where(eq(tables.folder.id, input.id));
			return { ok: true };
		}),
		// Move a folder under a new parent (null = top level). Rejects making a folder its
		// own ancestor, which would orphan a subtree into a cycle.
		move: publicProcedure.input(z.object({ id: z.string(), parentId: z.string().nullable() })).mutation(async ({ input }) => {
			if (input.parentId === input.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'a folder cannot be its own parent' });
			if (input.parentId) {
				// Walk up from the target parent; if we reach this folder, the move is a cycle.
				const all = await db.select().from(tables.folder);
				const byId = new Map(all.map((f) => [f.id, f]));
				let cur: string | null = input.parentId;
				while (cur) {
					if (cur === input.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'cannot move a folder into its own descendant' });
					cur = byId.get(cur)?.parentId ?? null;
				}
			}
			await db.update(tables.folder).set({ parentId: input.parentId }).where(eq(tables.folder.id, input.id));
			return { ok: true };
		}),
		// Delete a folder. Its child folders and tests are reparented up to this folder's
		// own parent (so nothing is orphaned or deleted); tests are never removed here.
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			const folder = await db.query.folder.findFirst({ where: eq(tables.folder.id, input.id) });
			if (!folder) return { ok: true };
			const newParent = folder.parentId ?? null;
			await db.update(tables.folder).set({ parentId: newParent }).where(eq(tables.folder.parentId, input.id));
			await db.update(tables.test).set({ folderId: newParent }).where(eq(tables.test.folderId, input.id));
			await db.delete(tables.folder).where(eq(tables.folder.id, input.id));
			return { ok: true };
		}),
	}),

	runs: router({
		get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
			const run = await db.query.run.findFirst({ where: eq(tables.run.id, input.id) });
			if (!run) return null;
			const steps = await db.select().from(tables.stepResult).where(eq(tables.stepResult.runId, input.id)).orderBy(tables.stepResult.idx);
			// Plain-language description per step index, from the test version's DSL (actions expanded).
			// Segments drive the styled UI; the flat strings stay for any plain-text consumer.
			const version = await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, run.testVersionId) });
			const descriptions = version ? await describeExpanded(version.dsl) : [];
			const descriptionSegments = version ? await describeExpandedSegments(version.dsl) : [];
			const test = version ? await db.query.test.findFirst({ where: eq(tables.test.id, version.testId) }) : null;
			return { run, steps, descriptions, descriptionSegments, test };
		}),

		listByTest: publicProcedure.input(z.object({ testId: z.string() })).query(async ({ input }) => {
			const versions = await db.select({ id: tables.testVersion.id }).from(tables.testVersion).where(eq(tables.testVersion.testId, input.testId));
			const ids = versions.map((v) => v.id);
			if (ids.length === 0) return [];
			return db.select().from(tables.run).where(inArray(tables.run.testVersionId, ids)).orderBy(desc(tables.run.createdAt));
		}),

		create: publicProcedure
			.input(z.object({ testId: z.string(), viewport: z.string().default('1280x720'), baseUrl: z.string().optional(), loginFlowId: z.string().optional() }))
			.mutation(async ({ input }) => {
				const ids = await enqueueTestRuns(input.testId, input.viewport, input.baseUrl, input.loginFlowId);
				return { id: ids[0], ids, count: ids.length };
			}),

		// Enqueue runs for several tests at once (a run per browser × data row per test),
		// so a folder-full of tests can be launched together instead of one at a time.
		// A test with no current version is skipped rather than failing the whole batch.
		createMany: publicProcedure
			.input(z.object({ testIds: z.array(z.string()).min(1), viewport: z.string().default('1280x720') }))
			.mutation(async ({ input }) => {
				const ids: string[] = [];
				for (const testId of input.testIds) {
					try {
						ids.push(...(await enqueueTestRuns(testId, input.viewport)));
					} catch {
						// Skip a test that can't be enqueued (e.g. no current version).
					}
				}
				return { ids, count: ids.length };
			}),

		// Re-run an existing run with the SAME version, browser, and viewport as a fresh
		// run row (the original is left as-is for history). The login flow is resolved from
		// the test's settings, like `create`. Data-driven `vars` aren't stored on the run
		// row, so a retry runs without the original row's seed variables.
		retry: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			const prev = await db.query.run.findFirst({ where: eq(tables.run.id, input.id) });
			if (!prev) throw new TRPCError({ code: 'NOT_FOUND', message: 'run not found' });
			const version = await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, prev.testVersionId) });
			if (!version) throw new TRPCError({ code: 'NOT_FOUND', message: 'test version not found' });
			const test = await db.query.test.findFirst({ where: eq(tables.test.id, version.testId) });

			const settings = test?.settings ? (JSON.parse(test.settings) as { loginFlowId?: string }) : {};
			const loginFlowId = settings.loginFlowId;

			// Don't retry on a temporarily disabled engine (e.g. an old WebKit run); fall
			// back to chromium so the retry can actually launch.
			const browser = (DISABLED_BROWSERS ?? []).includes(prev.browser as never) ? 'chromium' : prev.browser;

			const [run] = await db
				.insert(tables.run)
				.values({ testVersionId: prev.testVersionId, status: 'queued', browser, viewport: prev.viewport })
				.returning();
			const job: RunJob = { runId: run.id, testVersionId: prev.testVersionId, viewport: prev.viewport, loginFlowId, browser };
			await runQueue.add('run', job);

			return { id: run.id };
		}),

		// Delete a run: its step results, its artifacts (everything under runs/<id>/),
		// and the run row. Irreversible.
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.stepResult).where(eq(tables.stepResult.runId, input.id));
			await deletePrefix(`runs/${input.id}/`);
			await db.delete(tables.run).where(eq(tables.run.id, input.id));
			return { ok: true };
		}),
	}),

	actions: router({
		// Reusable step groups for the default project, newest first.
		list: publicProcedure.query(async () => {
			const projectId = await ensureDefaultProject();
			return db.select().from(tables.action).where(eq(tables.action.projectId, projectId)).orderBy(desc(tables.action.createdAt));
		}),
		create: publicProcedure.input(z.object({ name: z.string().min(1), dsl: z.string() })).mutation(async ({ input }) => {
			// Validate the steps before persisting — an action is a normal DSL test body.
			validateDsl(input.dsl);
			const projectId = await ensureDefaultProject();
			const [row] = await db.insert(tables.action).values({ projectId, name: input.name, dsl: input.dsl }).returning();
			return { id: row.id };
		}),
		update: publicProcedure
			.input(z.object({ id: z.string(), name: z.string().min(1).optional(), dsl: z.string().optional() }))
			.mutation(async ({ input }) => {
				if (input.dsl) validateDsl(input.dsl);
				const patch: Record<string, string> = {};
				if (input.name) patch.name = input.name;
				if (input.dsl) patch.dsl = input.dsl;
				// Nothing to change — skip the write (an empty SET is invalid SQL).
				if (Object.keys(patch).length === 0) return { ok: true };

				await db.update(tables.action).set(patch).where(eq(tables.action.id, input.id));
				return { ok: true };
			}),
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.action).where(eq(tables.action.id, input.id));
			return { ok: true };
		}),
	}),

	loginFlows: router({
		// All login flows in the default project, with capture status (never the session blob).
		list: publicProcedure.query(async () => {
			const projectId = await ensureDefaultProject();
			return db
				.select({
					id: tables.loginFlow.id,
					name: tables.loginFlow.name,
					dsl: tables.loginFlow.dsl,
					lastCapturedAt: tables.loginFlow.lastCapturedAt,
					lastCaptureError: tables.loginFlow.lastCaptureError,
					cookieCount: tables.loginFlow.cookieCount,
					captured: tables.loginFlow.storageStateRef,
				})
				.from(tables.loginFlow)
				.where(eq(tables.loginFlow.projectId, projectId))
				.then((rows) => rows.map((r) => ({ ...r, captured: Boolean(r.captured) })));
		}),
		create: publicProcedure.input(z.object({ name: z.string().min(1), dsl: z.string() })).mutation(async ({ input }) => {
			validateDsl(input.dsl);
			const projectId = await ensureDefaultProject();
			const [row] = await db.insert(tables.loginFlow).values({ projectId, name: input.name, dsl: input.dsl }).returning();
			return { id: row.id };
		}),
		// Edit an existing flow's name and/or steps. Editing the steps invalidates any
		// captured session (the old cookies may no longer match the new flow), so we
		// clear the capture and the user re-captures.
		update: publicProcedure
			.input(z.object({ id: z.string(), name: z.string().min(1).optional(), dsl: z.string().optional() }))
			.mutation(async ({ input }) => {
				if (input.dsl) validateDsl(input.dsl);
				const patch: Record<string, unknown> = {};
				if (input.name) patch.name = input.name;
				if (input.dsl) {
					patch.dsl = input.dsl;
					// The captured session belongs to the old steps; drop it so a stale
					// session is never silently reused against the edited flow. The session
					// blob is stored inline in storageStateRef (encrypted), not as an external
					// object, so nulling it fully discards it — nothing else to clean up.
					patch.storageStateRef = null;
					patch.lastCapturedAt = null;
					patch.lastCaptureError = null;
					patch.cookieCount = null;
				}
				// Nothing to change — skip the write (an empty SET is invalid SQL).
				if (Object.keys(patch).length === 0) return { ok: true };

				await db.update(tables.loginFlow).set(patch).where(eq(tables.loginFlow.id, input.id));
				return { ok: true };
			}),
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			// Clean up the flow's capture attempts (steps first) before the flow itself.
			const runs = await db.select({ id: tables.captureRun.id }).from(tables.captureRun).where(eq(tables.captureRun.loginFlowId, input.id));
			const runIds = runs.map((r) => r.id);
			if (runIds.length) {
				await db.delete(tables.captureStep).where(inArray(tables.captureStep.captureRunId, runIds));
				await db.delete(tables.captureRun).where(eq(tables.captureRun.loginFlowId, input.id));
			}
			await db.delete(tables.loginFlow).where(eq(tables.loginFlow.id, input.id));
			return { ok: true };
		}),
		// Enqueue a job that runs the flow and captures its session (encrypted at rest).
		capture: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await runQueue.add('capture', { captureLoginState: input.id });
			return { ok: true };
		}),
		// Capture attempts for a flow (newest first) — the observable record of each capture.
		captureRuns: publicProcedure.input(z.object({ loginFlowId: z.string() })).query(async ({ input }) => {
			return db.select().from(tables.captureRun).where(eq(tables.captureRun.loginFlowId, input.loginFlowId)).orderBy(desc(tables.captureRun.createdAt));
		}),
		// A single capture attempt with its per-step results and plain-language descriptions.
		captureRun: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
			const run = await db.query.captureRun.findFirst({ where: eq(tables.captureRun.id, input.id) });
			if (!run) return null;
			const steps = await db.select().from(tables.captureStep).where(eq(tables.captureStep.captureRunId, input.id)).orderBy(tables.captureStep.idx);
			const flow = await db.query.loginFlow.findFirst({ where: eq(tables.loginFlow.id, run.loginFlowId) });
			const descriptions = flow ? await describeExpanded(flow.dsl) : [];
			const descriptionSegments = flow ? await describeExpandedSegments(flow.dsl) : [];
			return { run, steps, descriptions, descriptionSegments, flow: flow ? { id: flow.id, name: flow.name } : null };
		}),
		// Delete a capture attempt: its steps, its artifacts, and the row.
		removeCaptureRun: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.captureStep).where(eq(tables.captureStep.captureRunId, input.id));
			await deletePrefix(`captures/${input.id}/`);
			await db.delete(tables.captureRun).where(eq(tables.captureRun.id, input.id));
			return { ok: true };
		}),
	}),

	schedules: router({
		listByTest: publicProcedure.input(z.object({ testId: z.string() })).query(async ({ input }) => {
			return db.select().from(tables.schedule).where(eq(tables.schedule.testId, input.testId));
		}),
		create: publicProcedure
			.input(z.object({ testId: z.string(), cron: z.string().min(1), tz: z.string().default('UTC') }))
			.mutation(async ({ input }) => {
				const [row] = await db.insert(tables.schedule).values(input).returning();
				return { id: row.id };
			}),
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.schedule).where(eq(tables.schedule.id, input.id));
			return { ok: true };
		}),
	}),

	baselines: router({
		// Promote a visualCheck's actual image to the baseline (overwrites the baseline object).
		approve: publicProcedure.input(z.object({ runId: z.string(), stepIdx: z.number() })).mutation(async ({ input }) => {
			const step = await db.query.stepResult.findFirst({
				where: and(eq(tables.stepResult.runId, input.runId), eq(tables.stepResult.idx, input.stepIdx)),
			});
			if (!step?.screenshotKey || !step.baselineKey) throw new Error('step has no actual/baseline image');
			await copyObject(step.screenshotKey, step.baselineKey);
			const bl = await db.query.baseline.findFirst({ where: eq(tables.baseline.imageKey, step.baselineKey) });
			if (bl) await db.update(tables.baseline).set({ approvedBy: 'ui' }).where(eq(tables.baseline.id, bl.id));
			return { ok: true };
		}),
	}),

	secrets: router({
		// Never returns secret values — only names/kinds.
		list: publicProcedure.query(async () => {
			const orgId = await ensureDefaultOrg();
			return db.select({ id: tables.secret.id, name: tables.secret.name, kind: tables.secret.kind }).from(tables.secret).where(eq(tables.secret.orgId, orgId));
		}),
		create: publicProcedure
			.input(z.object({ name: z.string().min(1), value: z.string().min(1), kind: z.enum(['password', 'totp']).default('password') }))
			.mutation(async ({ input }) => {
				const orgId = await ensureDefaultOrg();
				// Store encrypted; a TOTP seed is normalized (strip spaces, uppercase) before encrypting.
				const value = input.kind === 'totp' ? input.value.replace(/\s+/g, '').toUpperCase() : input.value;
				const [row] = await db.insert(tables.secret).values({ orgId, name: input.name, kind: input.kind, ref: encrypt(value) }).returning();
				return { id: row.id };
			}),
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.secret).where(eq(tables.secret.id, input.id));
			return { ok: true };
		}),
	}),

	apiKeys: router({
		list: publicProcedure.query(async () => {
			return db.select({ id: tables.apiKey.id, name: tables.apiKey.name, createdAt: tables.apiKey.createdAt }).from(tables.apiKey);
		}),
		create: publicProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ input }) => {
			const key = `gw_${crypto.randomUUID().replace(/-/g, '')}`;
			const [row] = await db.insert(tables.apiKey).values({ name: input.name, key }).returning();
			return { id: row.id, key };
		}),
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.apiKey).where(eq(tables.apiKey.id, input.id));
			return { ok: true };
		}),
	}),

	alerts: router({
		listByTest: publicProcedure.input(z.object({ testId: z.string() })).query(async ({ input }) => {
			const test = await db.query.test.findFirst({ where: eq(tables.test.id, input.testId) });
			if (!test) return [];
			return db.select().from(tables.alert).where(eq(tables.alert.projectId, test.projectId));
		}),
		create: publicProcedure
			.input(
				z.object({
					testId: z.string(),
					channel: z.enum(['slack', 'email', 'webhook', 'teams', 'pagerduty']),
					trigger: z.enum(['failure', 'always', 'change']).default('failure'),
					target: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const test = await db.query.test.findFirst({ where: eq(tables.test.id, input.testId) });
				if (!test) throw new Error('test not found');
				const [row] = await db
					.insert(tables.alert)
					.values({ projectId: test.projectId, channel: input.channel, trigger: input.trigger, target: input.target })
					.returning();
				return { id: row.id };
			}),
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.alert).where(eq(tables.alert.id, input.id));
			return { ok: true };
		}),
	}),
});

export type AppRouter = typeof appRouter;

/** Server-side caller for SSR pages (no HTTP round-trip). */
export function createCaller() {
	return appRouter.createCaller({});
}
