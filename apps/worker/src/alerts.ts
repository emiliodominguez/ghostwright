import { db, tables } from '@ghostwright/db';
import { createLogger } from '@ghostwright/otel/logger';
import { eq } from 'drizzle-orm';

const log = createLogger('worker.alerts');

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
	if (status !== 'failed' && status !== 'errored') return;

	const tv = await db.query.testVersion.findFirst({ where: eq(tables.testVersion.id, testVersionId) });
	if (!tv) return;
	const test = await db.query.test.findFirst({ where: eq(tables.test.id, tv.testId) });
	if (!test) return;
	const alerts = await db.select().from(tables.alert).where(eq(tables.alert.projectId, test.projectId));

	const text = `❌ Ghostwright: test "${test.name}" ${status}${error ? ` — ${error.split('\n')[0]}` : ''}`;
	const dashUrl = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:4321'}/runs/${runId}`;

	await Promise.all(
		alerts.map(async (a) => {
			try {
				if (a.channel === 'slack') {
					await postJson(a.target, { text: `${text}\n${dashUrl}` });
				} else if (a.channel === 'webhook') {
					await postJson(a.target, { event: 'run.failed', runId, test: test.name, status, error, url: dashUrl });
				} else if (a.channel === 'email') {
					await sendEmail(a.target, text, dashUrl);
				}
				log.info({ runId, channel: a.channel }, 'alert delivered');
			} catch (err) {
				log.warn({ runId, channel: a.channel, err: err instanceof Error ? err.message : String(err) }, 'alert delivery failed');
			}
		}),
	);
}

async function postJson(url: string, body: unknown): Promise<void> {
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
