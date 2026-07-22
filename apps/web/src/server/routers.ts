import { copyObject } from '@ghostwright/artifacts';
import { encrypt } from '@ghostwright/crypto';
import { db, tables } from '@ghostwright/db';
import { describeStep, expandActions, parseTest, testSettingsSchema, type Step } from '@ghostwright/dsl';
import { runQueue, type RunJob } from '@ghostwright/queue';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
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

/** Parse one CSV line, honoring double-quoted fields (with embedded commas and "" escapes). */
function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (inQuotes) {
			if (c === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (c === '"') inQuotes = false;
			else cur += c;
		} else if (c === '"') inQuotes = true;
		else if (c === ',') {
			out.push(cur.trim());
			cur = '';
		} else cur += c;
	}
	out.push(cur.trim());
	return out;
}

export function parseDataRows(text: string): Record<string, string>[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith('[')) {
		let arr: unknown;
		try {
			arr = JSON.parse(trimmed);
		} catch {
			throw new Error('data is not valid JSON');
		}
		if (!Array.isArray(arr)) throw new Error('JSON data must be an array of row objects');
		return (arr as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
	}
	const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];
	const headers = parseCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
		const cells = parseCsvLine(line);
		return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
	});
}

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

export const appRouter = router({
	tests: router({
		list: publicProcedure.query(async () => {
			return db.select().from(tables.test).orderBy(desc(tables.test.createdAt));
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

	runs: router({
		get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
			const run = await db.query.run.findFirst({ where: eq(tables.run.id, input.id) });
			if (!run) return null;
			const steps = await db.select().from(tables.stepResult).where(eq(tables.stepResult.runId, input.id)).orderBy(tables.stepResult.idx);
			// Plain-language description per step index, from the test version's DSL (actions expanded).
			const version = await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, run.testVersionId) });
			const descriptions = version ? await describeExpanded(version.dsl) : [];
			return { run, steps, descriptions };
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
				const test = await db.query.test.findFirst({ where: eq(tables.test.id, input.testId) });
				if (!test?.currentVersionId) throw new Error('test has no current version');
				const versionId = test.currentVersionId;
				// Data-driven: one run per row, each seeded with the row's columns as variables.
				const rows = test.dataJson ? (JSON.parse(test.dataJson) as Record<string, string>[]) : [];
				const batches = rows.length > 0 ? rows : [undefined];
				// Multi-browser: one run per browser × row (default chromium).
				const settings = test.settings ? (JSON.parse(test.settings) as { browsers?: string[]; loginFlowId?: string }) : {};
				const browsers = settings.browsers?.length ? settings.browsers : ['chromium'];
				// Log in first using the test's bound login flow (or an explicit override).
				const loginFlowId = input.loginFlowId ?? settings.loginFlowId;
				const ids: string[] = [];
				for (const browser of browsers) {
					for (const vars of batches) {
						const [run] = await db
							.insert(tables.run)
							.values({ testVersionId: versionId, status: 'queued', browser, viewport: input.viewport })
							.returning();
						const job: RunJob = { runId: run.id, testVersionId: versionId, viewport: input.viewport, baseUrl: input.baseUrl, loginFlowId, browser, vars };
						await runQueue.add('run', job);
						ids.push(run.id);
					}
				}
				return { id: ids[0], ids, count: ids.length };
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
		remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await db.delete(tables.loginFlow).where(eq(tables.loginFlow.id, input.id));
			return { ok: true };
		}),
		// Enqueue a job that runs the flow and captures its session (encrypted at rest).
		capture: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
			await runQueue.add('capture', { captureLoginState: input.id });
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
