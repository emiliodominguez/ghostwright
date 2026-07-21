import { copyObject } from '@ghostwright/artifacts';
import { db, tables } from '@ghostwright/db';
import { describeStep, expandActions, parseTest, testSettingsSchema, type Step } from '@ghostwright/dsl';
import { runQueue, type RunJob } from '@ghostwright/queue';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

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
 * Parse data-driven rows from a JSON array or CSV (first line = headers).
 *
 * @param text - pasted JSON or CSV.
 * @returns an array of `{column: value}` rows (empty if the input is blank).
 */
export function parseDataRows(text: string): Record<string, string>[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith('[')) {
		const arr = JSON.parse(trimmed) as Record<string, unknown>[];
		return arr.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
	}
	const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];
	const split = (l: string) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
	const headers = split(lines[0]);
	return lines.slice(1).map((line) => {
		const cells = split(line);
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
				parseTest(JSON.parse(input.dsl));
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
			const rows = parseDataRows(input.text);
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
				const ids: string[] = [];
				for (const vars of batches) {
					const [run] = await db
						.insert(tables.run)
						.values({ testVersionId: versionId, status: 'queued', viewport: input.viewport })
						.returning();
					const job: RunJob = { runId: run.id, testVersionId: versionId, viewport: input.viewport, baseUrl: input.baseUrl, loginFlowId: input.loginFlowId, vars };
					await runQueue.add('run', job);
					ids.push(run.id);
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
			parseTest(JSON.parse(input.dsl));
			const projectId = await ensureDefaultProject();
			const [row] = await db.insert(tables.action).values({ projectId, name: input.name, dsl: input.dsl }).returning();
			return { id: row.id };
		}),
		update: publicProcedure
			.input(z.object({ id: z.string(), name: z.string().min(1).optional(), dsl: z.string().optional() }))
			.mutation(async ({ input }) => {
				if (input.dsl) parseTest(JSON.parse(input.dsl));
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
		listByProject: publicProcedure.input(z.object({ projectId: z.string() })).query(async ({ input }) => {
			return db.select().from(tables.loginFlow).where(eq(tables.loginFlow.projectId, input.projectId));
		}),
		create: publicProcedure
			.input(z.object({ projectId: z.string(), name: z.string().min(1), dsl: z.string(), totpSecretRef: z.string().optional() }))
			.mutation(async ({ input }) => {
				parseTest(JSON.parse(input.dsl));
				const [row] = await db.insert(tables.loginFlow).values(input).returning();
				return { id: row.id };
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

	alerts: router({
		listByTest: publicProcedure.input(z.object({ testId: z.string() })).query(async ({ input }) => {
			const test = await db.query.test.findFirst({ where: eq(tables.test.id, input.testId) });
			if (!test) return [];
			return db.select().from(tables.alert).where(eq(tables.alert.projectId, test.projectId));
		}),
		create: publicProcedure
			.input(z.object({ testId: z.string(), channel: z.enum(['slack', 'email', 'webhook']), target: z.string().min(1) }))
			.mutation(async ({ input }) => {
				const test = await db.query.test.findFirst({ where: eq(tables.test.id, input.testId) });
				if (!test) throw new Error('test not found');
				const [row] = await db.insert(tables.alert).values({ projectId: test.projectId, channel: input.channel, target: input.target }).returning();
				return { id: row.id };
			}),
	}),
});

export type AppRouter = typeof appRouter;

/** Server-side caller for SSR pages (no HTTP round-trip). */
export function createCaller() {
	return appRouter.createCaller({});
}
