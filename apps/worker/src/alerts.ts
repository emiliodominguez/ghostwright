import { db, tables } from '@ghostwright/db';
import { createLogger } from '@ghostwright/otel/logger';
import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { assertUrlAllowed } from './net-guard';

const log = createLogger('worker.alerts');

/**
 * The status of the most recent *finalized* prior run for this test on the SAME browser.
 * Scoping to the same browser and to finished runs avoids fan-out siblings (created at
 * near-identical times, some still running) being mistaken for "the previous result".
 */
async function previousStatus(testId: string, currentRunId: string, browser: string): Promise<string | undefined> {
	const versions = await db.select({ id: tables.testVersion.id }).from(tables.testVersion).where(eq(tables.testVersion.testId, testId));
	const ids = versions.map((v) => v.id);
	if (!ids.length) return undefined;
	const prev = await db
		.select({ status: tables.run.status })
		.from(tables.run)
		.where(and(inArray(tables.run.testVersionId, ids), ne(tables.run.id, currentRunId), eq(tables.run.browser, browser), isNotNull(tables.run.finishedAt)))
		.orderBy(desc(tables.run.finishedAt))
		.limit(1);
	return prev[0]?.status;
}

/**
 * Deliver alerts for a finished run to every channel configured on its project.
 * Slack, generic webhook, and email are all best-effort — a delivery failure is
 * logged but never changes the run's verdict.
 *
 * @param runId - the finished run.
 * @param testVersionId - the run's version (used to resolve the project).
 * @param status - final run status.
 * @param error - failure message, if any.
 */
export async function dispatchAlerts(runId: string, testVersionId: string, status: string, error?: string): Promise<void> {
	const tv = await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, testVersionId) });
	if (!tv) return;
	const test = await db.query.test.findFirst({ where: eq(tables.test.id, tv.testId) });
	if (!test) return;
	const alerts = await db.select().from(tables.alert).where(eq(tables.alert.projectId, test.projectId));
	if (!alerts.length) return;

	const run = await db.query.run.findFirst({ where: eq(tables.run.id, runId) });
	const browser = run?.browser ?? 'chromium';
	const failed = status === 'failed' || status === 'errored';
	const prev = await previousStatus(test.id, runId, browser);
	const changed = prev !== undefined && prev !== status;

	const emoji = failed ? '❌' : '✅';
	const text = `${emoji} Ghostwright: test "${test.name}" ${status}${error ? ` — ${error.split('\n')[0]}` : ''}`;
	const dashUrl = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:4321'}/runs/${runId}`;

	await Promise.all(
		alerts.map(async (a) => {
			// PagerDuty always maintains incident state (trigger on fail, resolve on pass).
			const shouldFire = a.channel === 'pagerduty' || (a.trigger === 'always' ? true : a.trigger === 'change' ? changed : failed);
			if (!shouldFire) return;
			try {
				if (a.channel === 'slack') {
					await postJson(a.target, { text: `${text}\n${dashUrl}` });
				} else if (a.channel === 'webhook') {
					await postJson(a.target, { event: failed ? 'run.failed' : 'run.passed', runId, test: test.name, status, error, url: dashUrl });
				} else if (a.channel === 'teams') {
					await postJson(a.target, { title: 'Ghostwright', text: `${text}\n\n[View run](${dashUrl})` });
				} else if (a.channel === 'pagerduty') {
					await pagerDuty(a.target, failed, `${test.id}-${browser}`, test.name, error, dashUrl);
				} else if (a.channel === 'email') {
					await sendEmail(a.target, text, dashUrl);
				}
				log.info({ runId, channel: a.channel, trigger: a.trigger }, 'alert delivered');
			} catch (err) {
				log.warn({ runId, channel: a.channel, err: err instanceof Error ? err.message : String(err) }, 'alert delivery failed');
			}
		}),
	);
}

/** PagerDuty Events API v2 — trigger an incident on failure, resolve on pass (deduped per test×browser). */
async function pagerDuty(routingKey: string, failed: boolean, dedupBase: string, testName: string, error: string | undefined, url: string): Promise<void> {
	await postJson('https://events.pagerduty.com/v2/enqueue', {
		routing_key: routingKey,
		event_action: failed ? 'trigger' : 'resolve',
		dedup_key: `ghostwright-${dedupBase}`,
		payload: { summary: `Ghostwright: ${testName} ${failed ? 'failed' : 'recovered'}${error ? ` — ${error.split('\n')[0]}` : ''}`, source: url, severity: 'error' },
	});
}

async function postJson(url: string, body: unknown): Promise<void> {
	await assertUrlAllowed(url);
	const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	if (!res.ok) throw new Error(`webhook ${res.status}`);
}

async function sendEmail(to: string, text: string, url: string): Promise<void> {
	// SMTP requires SMTP_URL to be configured; without it, email alerts are a no-op.
	if (!process.env.SMTP_URL) {
		log.warn({ to }, 'email alert skipped — SMTP_URL not configured');
		return;
	}
	const { createTransport } = await import('nodemailer');
	const transport = createTransport(process.env.SMTP_URL);
	await transport.sendMail({ from: process.env.SMTP_FROM ?? 'ghostwright@localhost', to, subject: 'Ghostwright alert', text: `${text}\n${url}` });
}
