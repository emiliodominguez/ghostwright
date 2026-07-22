# Architecture

Ghostwright is a pnpm monorepo made of three long-lived processes and a set of shared
packages. This document explains what each part does and how a test goes from an idea to a
result.

## The three processes

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
Chromium, Firefox, and WebKit, and can run the same test on more than one of them.

### Scheduler (`apps/scheduler`)

A small loop that reconciles cron schedules into queued runs. When a test is due, the
scheduler enqueues a job for the worker to pick up.

## Shared packages

| Package | Responsibility |
| --- | --- |
| `dsl` | The test step schema (validated with Zod), the compiler that turns steps into Playwright actions, the code generator, and the functions that describe steps in plain language. Also holds the locator model and the self-healing logic. |
| `db` | The Drizzle ORM schema, the libSQL client, and migrations. libSQL is SQLite-compatible and is the only application datastore. |
| `queue` | BullMQ queue definitions shared by the web, worker, and scheduler. |
| `artifacts` | Helpers for the S3 or MinIO object store, including a range-aware reader for streaming video and traces. |
| `crypto` | AES-256-GCM encryption used to store passwords and TOTP seeds. |
| `ai` | Claude-backed failure triage and natural-language step resolution. |
| `mcp` | A Model Context Protocol server so AI agents can list tests and trigger runs. |
| `otel` | OpenTelemetry setup shared across processes. |
| `cli` | A command line runner for CI. |

## Data stores

- **libSQL** holds all application data: tests, versions, runs, step results, baselines,
  schedules, alerts, secrets, login flows, actions, and API keys. It is SQLite-compatible.
- **Redis** is only the queue backend for BullMQ. It does not hold application data.
- **MinIO (or any S3-compatible store)** holds artifacts: screenshots, videos, traces, and
  HARs.

## The life of a run

1. A user authors a test in the dashboard. It is saved as a small JSON document, the step
   DSL, attached to a test version.
2. A run is created, either because the scheduler reached a cron boundary or because a user
   clicked Run now or called the API. The web or scheduler enqueues a job on Redis.
3. The worker takes the job. It resolves settings (browser, viewport, login flow, data row,
   timeouts), starts a browser context, and begins recording a trace and a video.
4. The worker compiles the DSL and executes each step. It captures a screenshot per step and,
   for visual checks, compares against the stored baseline.
5. When the run finishes, the worker uploads the trace, video, HAR, and screenshots to the
   object store, and writes the run and step results to the database.
6. If the test failed and AI is enabled, a triage summary is generated and stored with the run.
7. Alerts are evaluated against the outcome and delivered to their channels.
8. The dashboard reads the run and shows the steps, screenshots, visual diffs, the embedded
   trace viewer, and the AI triage.

## Observability

Every process exports OpenTelemetry traces to the collector, which forwards them to Tempo.
Metrics are scraped by Prometheus. Grafana ships with provisioned dashboards. Logs are
structured through pino.
