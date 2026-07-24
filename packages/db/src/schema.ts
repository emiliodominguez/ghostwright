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
	// Folder this test lives in (null = top level / unfiled). Plain text to avoid a
	// circular FK ordering issue with the folder table.
	folderId: text('folder_id'),
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

// A folder for organizing tests. Nestable via `parentId` (a null parent is a
// top-level folder). Replaces the never-used `suite` table.
export const folder = sqliteTable('folder', {
	id: id(),
	projectId: text('project_id')
		.notNull()
		.references(() => project.id),
	name: text('name').notNull(),
	parentId: text('parent_id'),
	// Whether the folder is collapsed in the tree UI. Persisted so the collapsed
	// state survives reloads and is resolved server-side (no expand/collapse flicker).
	collapsed: integer('collapsed', { mode: 'boolean' })
		.notNull()
		.$defaultFn(() => false),
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
	browser: text('browser').notNull().default('chromium'),
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
	// 'password' → usable as {{secret.NAME}}; 'totp' → base32 seed for the totp step
	kind: text('kind', { enum: ['password', 'totp'] })
		.notNull()
		.default('password'),
	// encrypted ciphertext ref (AES-256-GCM) — never a plaintext secret
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

export const apiKey = sqliteTable('api_key', {
	id: id(),
	name: text('name').notNull(),
	// the bearer token presented via ?apiKey= or Authorization: Bearer
	key: text('key').notNull().unique(),
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
	// capture status (verification): when it last ran, its error (null=ok), and cookie count
	lastCapturedAt: integer('last_captured_at', { mode: 'timestamp_ms' }),
	lastCaptureError: text('last_capture_error'),
	cookieCount: integer('cookie_count'),
	createdAt: createdAt(),
});

// A single capture attempt for a login flow — the observable, debuggable record of
// running the flow's steps to grab a session. Mirrors `run`, but keyed to a login
// flow instead of a test version, and adds `cookieCount` as the capture's payload.
export const captureRun = sqliteTable('capture_run', {
	id: id(),
	loginFlowId: text('login_flow_id')
		.notNull()
		.references(() => loginFlow.id),
	status: text('status', { enum: ['queued', 'running', 'passed', 'failed', 'errored'] })
		.notNull()
		.default('queued'),
	// How many cookies the captured session held (the point of a capture).
	cookieCount: integer('cookie_count'),
	traceKey: text('trace_key'),
	videoKey: text('video_key'),
	screenshotKey: text('screenshot_key'),
	error: text('error'),
	startedAt: integer('started_at', { mode: 'timestamp_ms' }),
	finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
	createdAt: createdAt(),
});

// Per-step result for a capture attempt. Mirrors `step_result` (no visual-check fields).
export const captureStep = sqliteTable('capture_step', {
	id: id(),
	captureRunId: text('capture_run_id')
		.notNull()
		.references(() => captureRun.id),
	idx: integer('idx').notNull(),
	type: text('type').notNull(),
	status: text('status', { enum: ['passed', 'failed', 'skipped'] }).notNull(),
	durationMs: integer('duration_ms'),
	screenshotKey: text('screenshot_key'),
	error: text('error'),
	createdAt: createdAt(),
});
