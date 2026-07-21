import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, tables } from '@ghostwright/db';
import { parseTest } from '@ghostwright/dsl';
import { runQueue } from '@ghostwright/queue';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

function text(value: unknown) {
	return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

async function ensureProject(): Promise<string> {
	const existing = await db.query.project.findFirst();
	if (existing) return existing.id;
	const [org] = await db.insert(tables.org).values({ name: 'default' }).returning();
	const [project] = await db.insert(tables.project).values({ orgId: org!.id, name: 'default' }).returning();
	return project!.id;
}

/**
 * Build the Ghostwright MCP server exposing test authoring/running/inspection to
 * AI agents. Transport-agnostic — connect it to stdio or Streamable HTTP.
 *
 * @returns a configured McpServer.
 */
export function buildServer(): McpServer {
	const server = new McpServer({ name: 'ghostwright', version: '0.1.0' });

	server.registerTool('list_tests', { title: 'List tests', description: 'List all browser tests.', inputSchema: {} }, async () =>
		text(await db.select({ id: tables.test.id, name: tables.test.name }).from(tables.test).orderBy(desc(tables.test.createdAt))),
	);

	server.registerTool(
		'create_test',
		{
			title: 'Create test',
			description: 'Create a browser test from a name and a Ghostwright DSL JSON string ({ steps: [...] }).',
			inputSchema: { name: z.string(), dsl: z.string() },
		},
		async ({ name, dsl }) => {
			parseTest(JSON.parse(dsl));
			const projectId = await ensureProject();
			const [test] = await db.insert(tables.test).values({ projectId, name }).returning();
			const [version] = await db.insert(tables.testVersion).values({ testId: test!.id, dsl }).returning();
			await db.update(tables.test).set({ currentVersionId: version!.id }).where(eq(tables.test.id, test!.id));
			return text({ id: test!.id });
		},
	);

	server.registerTool(
		'run_test',
		{
			title: 'Run test',
			description: 'Enqueue a run for a test and return the run id.',
			inputSchema: { testId: z.string(), viewport: z.string().optional() },
		},
		async ({ testId, viewport }) => {
			const test = await db.query.test.findFirst({ where: eq(tables.test.id, testId) });
			if (!test?.currentVersionId) throw new Error('test has no current version');
			const [run] = await db
				.insert(tables.run)
				.values({ testVersionId: test.currentVersionId, status: 'queued', viewport: viewport ?? '1280x720' })
				.returning();
			await runQueue.add('run', { runId: run!.id, testVersionId: test.currentVersionId, viewport: viewport ?? '1280x720' });
			return text({ runId: run!.id });
		},
	);

	server.registerTool(
		'get_run_result',
		{ title: 'Get run result', description: 'Fetch a run and its step results.', inputSchema: { runId: z.string() } },
		async ({ runId }) => {
			const run = await db.query.run.findFirst({ where: eq(tables.run.id, runId) });
			if (!run) return text({ error: 'not found' });
			const steps = await db.select().from(tables.stepResult).where(eq(tables.stepResult.runId, runId)).orderBy(tables.stepResult.idx);
			return text({ run, steps });
		},
	);

	return server;
}
