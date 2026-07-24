# Architecture

Ghostwright is a pnpm monorepo made of two long-lived processes and a set of shared
packages. This document explains what each part does and how a test goes from an idea to a
result.

## The two processes

### Web (`apps/web`)

The dashboard and the API. It is an Astro application rendered on the server, with Solid
components mounted as islands for the interactive parts (the test builder, the settings
panels, the custom-code editors). Styling is a hand-written SCSS design system with light
and dark themes.

The web app talks to the database directly for reads and simple writes through tRPC, and it
exposes a versioned REST API under `/api/v1` for automation. It also proxies artifacts
(screenshots, videos, traces) from the object store so the embedded Playwright trace viewer
can load them from the same origin.

### Worker (`apps/worker`)

The part that actually runs tests. It consumes jobs from the Redis queue, loads the test
version, compiles its DSL into Playwright actions, and drives a real browser. During a run it
records a trace, a video, and a HAR, and it takes screenshots. Afterwards it uploads those
artifacts to the object store and writes the step results back to the database.

The worker needs a browser runtime, so in production it runs as a container. It supports
Chromium and Firefox and can run the same test on both (WebKit is temporarily disabled).
Each run gets its own browser, context, and page. Runs are serialized per target
application (by base URL host) so tests sharing server-side state do not overlap, while
runs against different apps proceed in parallel; the global queue size is configurable.

## Shared packages

| Package | Responsibility |
| --- | --- |
| `dsl` | The test step schema (validated with Zod), the compiler that turns steps into Playwright actions, the code generator, and the functions that describe steps in plain language. Also holds the locator model and the self-healing logic. |
| `db` | The Drizzle ORM schema, the libSQL client, and migrations. libSQL is SQLite-compatible and is the only application datastore. |
| `queue` | BullMQ queue definitions shared by the web and worker. |
| `artifacts` | Helpers for the S3 or MinIO object store, including a range-aware reader for streaming video and traces. |
| `crypto` | AES-256-GCM encryption used to store passwords and TOTP seeds. |
| `ai` | Claude-backed failure triage and natural-language step resolution. |
| `logger` | A tiny dependency-free structured logger (JSON to stdout) used by the worker. |
| `devtools` | Local development tooling only: database seeding (`seed`, `seed:wonderly`) and demo job enqueuing. Never imported by the runtime apps or worker. |

## Data stores

- **libSQL** holds all application data: tests, versions, folders, runs, step results,
  baselines, schedules, alerts, secrets, login flows and their capture runs, actions, and
  API keys. It is SQLite-compatible.
- **Redis** is only the queue backend for BullMQ. It does not hold application data.
- **MinIO (or any S3-compatible store)** holds artifacts: screenshots, videos, traces, and
  HARs.

## The life of a run

1. A user authors a test in the dashboard. It is saved as a small JSON document, the step
   DSL, attached to a test version.
2. A run is created because a user clicked Run now or called the REST API. The web app
   enqueues a job on Redis.
3. The worker takes the job. It acquires the target app's lock (so it does not run
   concurrently with another test against the same app), resolves settings (browser,
   viewport, login flow, data row, timeouts), starts a fresh browser context, and begins
   recording a trace and a video.
4. The worker compiles the DSL and executes each step. It captures a screenshot per step and,
   for visual checks, compares against the stored baseline.
5. When the run finishes, the worker uploads the trace, video, HAR, and screenshots to the
   object store, and writes the run and step results to the database.
6. If the test failed and AI is enabled, a triage summary is generated and stored with the run.
7. Alerts are evaluated against the outcome and delivered to their channels.
8. The dashboard reads the run and shows the steps, screenshots, visual diffs, the embedded
   trace viewer, and the AI triage.

## Logging

Each process writes structured JSON logs to stdout, filtered by `LOG_LEVEL`.
