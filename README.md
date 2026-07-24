# Ghostwright

Self-hosted browser testing. Build tests by describing what they should do in plain
language, run them on demand or from CI, and get alerted when your app breaks. Powered
by Playwright, with an escape hatch to real code when you need it.

Ghostwright is designed for two kinds of people at once:

- **Non-technical users** build and read tests as plain-language steps. No code required.
- **Developers** get precise selectors, custom JavaScript steps, a real trace viewer, and a
  REST API.

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
- **Run history.** Every run is kept with its status, artifacts, and step results, so a test
  builds up a history you can review. (Scheduling is groundwork only: there is no schedule UI
  or scheduler process yet, so runs are triggered from the dashboard or the REST API.)
- **Alerts.** Notify Slack, a webhook, Microsoft Teams, PagerDuty, or email on failure, on
  status change, or on every run.
- **Visual regression.** Capture per test and per viewport baselines, compare against them
  with a tolerance, and ignore regions that change on every run.
- **Authentication to your app.** Record a login flow once, capture its session, and bind it
  to any test so runs start already signed in. Passwords are stored encrypted and referenced
  by name. Two-factor codes are supported through TOTP.
- **Data-driven tests.** Paste CSV or JSON and run the test once per row, with columns bound
  to variables.
- **Multiple browsers.** Run the same test on Chromium and Firefox (WebKit is coming soon).
- **Organized suites.** Group tests into nestable folders, search by name, and select many
  tests to run them together. Folder collapse state is remembered across visits.
- **Rich results.** Every run captures screenshots, a video, a Playwright trace, and a HAR.
  The trace viewer is embedded in the results page so you can replay the run frame by frame.
- **AI assistance.** When a test fails, an LLM explains the likely cause and a suggested fix.
  Plain-language steps can be resolved against the accessibility tree, and selectors can
  self-heal.
- **Structured logs.** Each process writes JSON log lines to stdout through a tiny built-in
  logger, with verbosity controlled by `LOG_LEVEL`.
- **Light and dark themes.**

## Documentation

| Guide | What it covers |
| --- | --- |
| [Features](docs/features.md) | Every feature by the surface you use it from: tests, runs, sessions, secrets, actions, scheduling, alerts, visual regression, data-driven runs, and run settings |
| [Authoring tests](docs/authoring.md) | Step reference, element targeting, variables, custom code, reusable actions |
| [API](docs/api.md) | REST endpoints and authentication |
| [Configuration](docs/configuration.md) | Every environment variable |
| [Self-hosting](docs/self-hosting.md) | Production deployment |
| [Architecture](docs/architecture.md) | How the processes, packages, and data stores fit together |

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
| Logging | Structured JSON logs via a built-in logger |
| Language and tooling | TypeScript, pnpm workspaces |

## How it fits together

1. You author a test in the dashboard. It is stored as a small JSON document (the step DSL).
2. A run is created from Run now, a bulk run, or the REST API.
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

# 3. Start the infrastructure (libSQL, Redis, MinIO)
pnpm infra:up

# 4. Apply database migrations
pnpm db:migrate

# 5. (optional) Seed realistic sample tests
pnpm db:seed

# 6. Install Playwright browsers for the local worker
pnpm --filter @ghostwright/worker exec playwright install chromium
```

Now start the two processes, each in its own terminal:

```bash
pnpm web         # dashboard on http://localhost:4321
pnpm worker      # runs queued tests
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
| `REDIS_HOST`, `REDIS_PORT` | Redis connection for the job queue |
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

packages/
  dsl/         Test step schema, compiler to Playwright, plain-language descriptions
  db/          Drizzle schema, libSQL client, migrations
  queue/       BullMQ queue definitions
  artifacts/   S3 / MinIO object storage helpers
  crypto/      AES-256-GCM encryption for stored secrets
  ai/          Claude-backed failure triage and step resolution
  logger/      Tiny dependency-free structured logger (JSON to stdout)
  devtools/    Local dev tooling: database seeding and demo enqueuing (not runtime)

infra/         Docker Compose stack
```

## Authoring tests

Tests are a list of steps. Every step is stored in a typed DSL and rendered both as a
plain-language sentence and, for developers, as editable code. Steps cover navigation,
interaction, waiting, assertions, screenshots, visual checks, data extraction, custom
JavaScript, and two-factor codes.

The full step reference and the custom-code model are in
[docs/authoring.md](docs/authoring.md).

## API

Ghostwright exposes a REST API for triggering runs and reading results. See
[docs/api.md](docs/api.md).

## Development

```bash
pnpm build          # build every package and app
pnpm typecheck      # type-check the whole workspace
pnpm format         # format with Prettier
pnpm test           # run the test suite
pnpm test:coverage  # run tests with a coverage report
```

## Deployment

Ghostwright is meant to be self-hosted. It runs as two long-lived processes (web and worker)
backed by libSQL, Redis, and an S3-compatible store. The worker needs a browser
runtime, so it is normally run as a container. See [docs/self-hosting.md](docs/self-hosting.md)
for a production setup.

## Security

- Ghostwright is single-tenant and self-hosted. There is no built-in multi-user login.
- Dashboard access can be gated with `GHOSTWRIGHT_ACCESS_TOKEN`.
- The REST API is authenticated with API keys.
- Stored passwords and TOTP seeds are encrypted with AES-256-GCM.
- The worker can block requests to private network ranges (set
  `GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK=1`) to reduce SSRF risk on shared deployments.

## License

MIT. See [LICENSE](LICENSE).
