import { db, tables } from '@ghostwright/db';
import { desc, eq, inArray } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { authApiKey, json, unauthorized } from '../../../../../server/api';

/** Runs for a test, newest first. */
async function testRuns(testId: string) {
	const versions = await db.select({ id: tables.testVersion.id }).from(tables.testVersion).where(eq(tables.testVersion.testId, testId));
	const ids = versions.map((v) => v.id);
	if (!ids.length) return [];
	return db.select().from(tables.run).where(inArray(tables.run.testVersionId, ids)).orderBy(desc(tables.run.createdAt));
}

function xmlEscape(s: string): string {
	return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/**
 * GET /api/v1/tests/:id/results?format=csv|xunit (default csv).
 * Exports the test's run history for CI reporting.
 */
export const GET: APIRoute = async ({ request, url, params }) => {
	if (!(await authApiKey(request, url))) return unauthorized();
	const runs = await testRuns(params.id!);
	const format = url.searchParams.get('format') ?? 'csv';

	if (format === 'xunit') {
		const failures = runs.filter((r) => r.status !== 'passed').length;
		const cases = runs
			.map((r) => {
				const t = r.startedAt && r.finishedAt ? (r.finishedAt.getTime() - r.startedAt.getTime()) / 1000 : 0;
				const body = r.status === 'passed' ? '' : `<failure message="${xmlEscape(r.error ?? r.status)}"/>`;
				return `    <testcase name="${xmlEscape(r.id)}" classname="${xmlEscape(r.browser)}" time="${t.toFixed(3)}">${body}</testcase>`;
			})
			.join('\n');
		const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="ghostwright" tests="${runs.length}" failures="${failures}">\n${cases}\n</testsuite>\n`;
		return new Response(xml, { headers: { 'content-type': 'application/xml' } });
	}

	const rows = [
		'id,status,browser,viewport,startedAt,finishedAt,error',
		...runs.map((r) =>
			[r.id, r.status, r.browser, r.viewport, r.startedAt?.toISOString() ?? '', r.finishedAt?.toISOString() ?? '', `"${(r.error ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`].join(','),
		),
	];
	if (url.searchParams.get('format') && format !== 'csv') return json({ error: 'format must be csv or xunit' }, 400);
	return new Response(rows.join('\n'), { headers: { 'content-type': 'text/csv' } });
};
