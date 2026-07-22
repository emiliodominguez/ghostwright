# Ghostwright

Self-hosted browser testing and synthetic monitoring. Build tests by describing what
they should do in plain language, run them on a schedule, and get alerted when your
app breaks. Powered by Playwright, with an escape hatch to real code when you need it.

Ghostwright is designed for two kinds of people at once:

- **Non-technical users** build and read tests as plain-language steps. No code required.
- **Developers** get precise selectors, custom JavaScript steps, a real trace viewer, a
  REST API, and a CLI for CI.

The tagline in the app says it best: watch your app, without writing code.

## Features

- **No-code test builder.** Add steps from a searchable menu. Each step reads as a
  sentence like `Click the "Sign in" button` or `Check that the heading contains "Welcome"`.
- **Reusable actions.** Save a group of steps (for example a login) and drop it into any test.
- **Custom code steps.** Run JavaScript in the page, assert with JavaScript, or extract a
  value into a variable. Code is written in an embedded editor with syntax highlighting.
- **Robust element targeting.** Find elements by role, text, label, placeholder, test id,
  CSS, or XPath. Add exact matching, pick the nth match, and list backup selectors that are
  tried if the main one is not found. Locators can self-heal when the page changes.
- **Real waiting.** Wait for a fixed time, for an element to appear or disappear, for the
  URL to match, or for the page to settle.
- **Assertions.** Check that elements are visible, hidden, present, or absent, and that the
  text or web address matches.
- **Scheduled monitoring.** Run tests on a cron schedule and keep a history of results.
- **Alerts.** Notify Slack, a webhook, Microsoft Teams, PagerDuty, or email on failure, on
  status change, or on every run.
- **Visual regression.** Capture per test and per viewport baselines, compare against them
  with a tolerance, and ignore regions that change on every run.
- **Authentication to your app.** Record a login flow once, capture its session, and bind it
  to any test so runs start already signed in. Passwords are stored encrypted and referenced
  by name. Two-factor codes are supported through TOTP.
- **Data-driven tests.** Paste CSV or JSON and run the test once per row, with columns bound
  to variables.
- **Multiple browsers.** Run the same test on Chromium, Firefox, and WebKit.
- **Rich results.** Every run captures screenshots, a video, a Playwright trace, and a HAR.
  The trace viewer is embedded in the results page so you can replay the run frame by frame.
- **AI assistance.** When a test fails, an LLM explains the likely cause and a suggested fix.
  Plain-language steps can be resolved against the accessibility tree, and selectors can
  self-heal.
- **MCP server.** Expose tests and runs to AI agents through the Model Context Protocol.
- **Fully observable.** OpenTelemetry traces, Prometheus metrics, Grafana dashboards, and
  structured logs.
- **Light and dark themes.**

## Stack

| Area | Technology |
| --- | --- |
| Dashboard | Astro (server-rendered), Solid islands, a custom SCSS design system, tRPC |
| Code editing | CodeMirror 6 |
| Application data | libSQL (SQLite-compatible) through Drizzle ORM |
| Queue | Redis with BullMQ |
| Artifacts | MinIO or any S3-compatible store |
| Test runner | Playwright, in a containerized worker |
| AI | Anthropic Claude |
| Observability | OpenTelemetry, Tempo, Prometheus, Grafana, pino logs |
| Language and tooling | TypeScript, pnpm workspaces |

## How it fits together

1. You author a test in the dashboard. It is stored as a small JSON document (the step DSL).
2. The scheduler enqueues runs on a cron schedule, or you click Run now.
3. The worker takes a job off the queue, compiles the DSL into Playwright actions, runs it in
   a browser, uploads artifacts to the object store, and writes results to the database.
4. The dashboard reads the results and shows the steps, screenshots, visual diffs, the
   embedded trace, and the AI triage.
5. Alerts fire based on the outcome.

See [docs/architecture.md](docs/architecture.md) for the full picture.

## Running it locally

### Prerequisites

- Node.js 22 or newer
- pnpm 11 or newer (`corepack enable` will provide it)
- Docker and Docker Compose (for the local infrastructure)

### Steps

```bash
# 1. Install dependencies
pnpm install

# 2. Create your local environment file
cp .env.example .env

# 3. Start the infrastructure (libSQL, Redis, MinIO, OpenTelemetry, Grafana)
pnpm infra:up

# 4. Apply database migrations
pnpm db:migrate

# 5. (optional) Seed realistic sample tests
pnpm db:seed

# 6. Install Playwright browsers for the local worker
pnpm --filter @ghostwright/worker exec playwright install chromium
```

Now start the three processes, each in its own terminal:

```bash
pnpm web         # dashboard on http://localhost:4321
pnpm worker      # runs queued tests
pnpm scheduler   # enqueues scheduled runs
```

Open http://localhost:4321 and build your first test.

To stop the infrastructure:

```bash
pnpm infra:down
```

## Configuration

Configuration is read from environment variables. `.env.example` lists the defaults for
local development. The full reference, including production settings, is in
[docs/configuration.md](docs/configuration.md).

The most important variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | libSQL endpoint for application data |
| `REDIS_URL` | Redis connection for the job queue |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Artifact object store |
| `GHOSTWRIGHT_SECRET_KEY` | Key used to encrypt stored secrets (required in production) |
| `ANTHROPIC_API_KEY` | Enables the AI features |
| `GHOSTWRIGHT_ACCESS_TOKEN` | Optional token that gates access to the dashboard |

## Project layout

This is a pnpm monorepo.

```
apps/
  web/         Astro + Solid dashboard, tRPC API, REST API
  worker/      Playwright runner that consumes the queue
  scheduler/   Turns cron schedules into queued runs

packages/
  dsl/         Test step schema, compiler to Playwright, plain-language descriptions
  db/          Drizzle schema, libSQL client, migrations
  queue/       BullMQ queue definitions
  artifacts/   S3 / MinIO object storage helpers
  crypto/      AES-256-GCM encryption for stored secrets
  ai/          Claude-backed failure triage and step resolution
  mcp/         Model Context Protocol server
  otel/        OpenTelemetry setup
  cli/         CI command line runner

infra/         Docker Compose stack and Grafana provisioning
```

## Authoring tests

Tests are a list of steps. Every step is stored in a typed DSL and rendered both as a
plain-language sentence and, for developers, as editable code. Steps cover navigation,
interaction, waiting, assertions, screenshots, visual checks, data extraction, custom
JavaScript, and two-factor codes.

The full step reference and the custom-code model are in
[docs/authoring.md](docs/authoring.md).

## API and CLI

Ghostwright exposes a REST API for triggering runs and reading results, and a small CLI
that fits into CI so a failing test can fail the build. See [docs/api.md](docs/api.md).

Quick CLI example:

```bash
export GHOSTWRIGHT_API_URL=https://ghostwright.example.com
export GHOSTWRIGHT_API_KEY=gw_xxx
npx @ghostwright/cli test execute <testId> --error-on-fail
```

## Development

```bash
pnpm build       # build every package and app
pnpm typecheck   # type-check the whole workspace
pnpm format      # format with Prettier
pnpm -r test     # run package tests (the DSL package has the largest suite)
```

## Deployment

Ghostwright is meant to be self-hosted. It runs as three long-lived processes (web, worker,
scheduler) backed by libSQL, Redis, and an S3-compatible store. The worker needs a browser
runtime, so it is normally run as a container. See [docs/self-hosting.md](docs/self-hosting.md)
for a production setup.

## Security

- Ghostwright is single-tenant and self-hosted. There is no built-in multi-user login.
- Dashboard access can be gated with `GHOSTWRIGHT_ACCESS_TOKEN`.
- The REST API is authenticated with API keys.
- Stored passwords and TOTP seeds are encrypted with AES-256-GCM.
- The worker blocks requests to private network ranges by default to reduce SSRF risk.

## License

MIT. See [LICENSE](LICENSE).
