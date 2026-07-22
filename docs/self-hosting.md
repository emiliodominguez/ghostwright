# Self-hosting

Ghostwright is built to be self-hosted. This guide covers what you need to run it beyond a
local development machine.

## What you need to run

Three application processes:

- **web**, the dashboard and API
- **worker**, the Playwright runner
- **scheduler**, which enqueues scheduled runs

Three backing services:

- **libSQL** for application data
- **Redis** for the job queue
- **An S3-compatible object store** (MinIO, or a managed S3) for artifacts

Optionally, the observability stack (OpenTelemetry collector, Tempo, Prometheus, Grafana).

## The included Docker Compose stack

`infra/docker-compose.yml` runs the backing services and the observability stack for local
use. Start it with:

```bash
pnpm infra:up
```

This brings up libSQL, Redis, MinIO (with a bucket created for you), the OpenTelemetry
collector, Tempo, Prometheus, Grafana, and a worker container. It is a good reference for a
production compose file, but for production you will usually point the app at managed or
hardened versions of these services.

Stop it with:

```bash
pnpm infra:down
```

## Building for production

```bash
pnpm install
pnpm build
```

Then run each process from its build output. The web app is a standard Astro Node server, the
worker and scheduler are Node programs. Provide the environment variables from
[configuration.md](configuration.md) to each.

## The worker needs a browser

The worker drives real browsers, so it needs the Playwright browser binaries and their system
dependencies. The simplest way to satisfy this is to run the worker as a container built on a
Playwright base image. If you run the worker directly on a host, install the browsers first:

```bash
pnpm --filter @ghostwright/worker exec playwright install --with-deps
```

Scale test throughput by running more worker instances or raising `WORKER_CONCURRENCY`.

## Production checklist

- Set `GHOSTWRIGHT_SECRET_KEY` to a strong, stable value. It encrypts stored passwords and
  TOTP seeds. If it changes, existing secrets can no longer be decrypted.
- Set `GHOSTWRIGHT_ACCESS_TOKEN` so the dashboard is not open to anyone who can reach it.
- Put the web app behind a reverse proxy that terminates TLS.
- Set `PUBLIC_BASE_URL` to the public URL of the dashboard so links and alerts are correct.
- Use durable storage for libSQL and the object store. Artifacts and history live there.
- Keep `GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK` enabled unless you specifically need the worker to
  reach internal hosts.
- Create API keys for any CI integrations rather than reusing the dashboard token.

## Observability

Each process exports OpenTelemetry traces to the collector, which forwards to Tempo.
Prometheus scrapes metrics, and Grafana ships with provisioned dashboards under
`infra/grafana`. Point `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` at your collector, or drop the
observability stack entirely if you do not need it.
