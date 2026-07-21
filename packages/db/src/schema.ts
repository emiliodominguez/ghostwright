import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

function id() {
	return text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
}

function createdAt() {
	return integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());
}

export const org = sqliteTable('org', {
	id: id(),
	name: text('name').notNull(),
	createdAt: createdAt(),
});

export const user = sqliteTable('user', {
	id: id(),
	orgId: text('org_id')
		.notNull()
		.references(() => org.id),
	email: text('email').notNull().unique(),
	name: text('name'),
	createdAt: createdAt(),
});

export const project = sqliteTable('project', {
	id: id(),
	orgId: text('org_id')
		.notNull()
		.references(() => org.id),
	name: text('name').notNull(),
	createdAt: createdAt(),
});

export const test = sqliteTable('test', {
	id: id(),
	projectId: text('project_id')
		.notNull()
		.references(() => project.id),
	name: text('name').notNull(),
	// current TestVersion pointer; plain text to avoid a circular FK with test_version
	currentVersionId: text('current_version_id'),
	// per-test run configuration (JSON: TestSettings from @ghostwright/dsl)
	settings: text('settings'),
	// data-driven rows (JSON: Array<Record<string,string>>); one run per row when present
	dataJson: text('data_json'),
	createdAt: createdAt(),
});

export const testVersion = sqliteTable('test_version', {
	id: id(),
	testId: text('test_id')
		.notNull()
		.references(() => test.id),
	// serialized DSL: { steps: Step[] }
	dsl: text('dsl').notNull(),
	createdBy: text('created_by'),
	createdAt: createdAt(),
});

export const suite = sqliteTable('suite', {
	id: id(),
	projectId: text('project_id')
		.notNull()
		.references(() => project.id),
	name: text('name').notNull(),
	createdAt: createdAt(),
});

export const run = sqliteTable('run', {
	id: id(),
	testVersionId: text('test_version_id')
		.notNull()
		.references(() => testVersion.id),
	status: text('status', { enum: ['queued', 'running', 'passed', 'failed', 'errored'] })
		.notNull()
		.default('queued'),
	viewport: text('viewport').notNull(),
	traceKey: text('trace_key'),
	videoKey: text('video_key'),
	harKey: text('har_key'),
	screenshotKey: text('screenshot_key'),
	error: text('error'),
	// AI failure-triage summary (JSON: {summary,likelyCause,suggestedFix}); null until triaged
	triage: text('triage'),
	startedAt: integer('started_at', { mode: 'timestamp_ms' }),
	finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
	createdAt: createdAt(),
});

export const stepResult = sqliteTable('step_result', {
	id: id(),
	runId: text('run_id')
		.notNull()
		.references(() => run.id),
	idx: integer('idx').notNull(),
	type: text('type').notNull(),
	status: text('status', { enum: ['passed', 'failed', 'skipped'] }).notNull(),
	durationMs: integer('duration_ms'),
	screenshotKey: text('screenshot_key'),
	// visualCheck outputs (null for non-visual steps)
	baselineKey: text('baseline_key'),
	diffKey: text('diff_key'),
	diffPct: real('diff_pct'),
	error: text('error'),
	createdAt: createdAt(),
});

export const baseline = sqliteTable('baseline', {
	id: id(),
	testId: text('test_id')
		.notNull()
		.references(() => test.id),
	// baselines are tracked per browser × viewport × name
	browser: text('browser').notNull().default('chromium'),
	viewport: text('viewport').notNull(),
	// visualCheck name — one baseline per (test, viewport, name)
	name: text('name').notNull().default('default'),
	imageKey: text('image_key').notNull(),
	approvedBy: text('approved_by'),
	createdAt: createdAt(),
});

export const schedule = sqliteTable('schedule', {
	id: id(),
	testId: text('test_id')
		.notNull()
		.references(() => test.id),
	cron: text('cron').notNull(),
	tz: text('tz').notNull().default('UTC'),
	enabled: integer('enabled', { mode: 'boolean' })
		.notNull()
		.$defaultFn(() => true),
	createdAt: createdAt(),
});

export const alert = sqliteTable('alert', {
	id: id(),
	projectId: text('project_id')
		.notNull()
		.references(() => project.id),
	channel: text('channel', { enum: ['slack', 'email', 'webhook', 'teams', 'pagerduty'] }).notNull(),
	// when to fire: on failure only, on every run, or only when status changes
	trigger: text('trigger', { enum: ['failure', 'always', 'change'] })
		.notNull()
		.default('failure'),
	// channel-specific destination (webhook URL, email address, PagerDuty routing key, etc.)
	target: text('target').notNull(),
	createdAt: createdAt(),
});

export const secret = sqliteTable('secret', {
	id: id(),
	orgId: text('org_id')
		.notNull()
		.references(() => org.id),
	name: text('name').notNull(),
	// Infisical path or encrypted ciphertext ref — never a plaintext secret
	ref: text('ref').notNull(),
	createdAt: createdAt(),
});

// A user-authored reusable action: a named group of steps that can be dropped into any test.
export const action = sqliteTable('action', {
	id: id(),
	projectId: text('project_id')
		.notNull()
		.references(() => project.id),
	name: text('name').notNull(),
	// serialized DSL: { steps: Step[] }
	dsl: text('dsl').notNull(),
	createdAt: createdAt(),
});

export const loginFlow = sqliteTable('login_flow', {
	id: id(),
	projectId: text('project_id')
		.notNull()
		.references(() => project.id),
	name: text('name').notNull(),
	dsl: text('dsl').notNull(),
	storageStateRef: text('storage_state_ref'),
	totpSecretRef: text('totp_secret_ref'),
	createdAt: createdAt(),
});
