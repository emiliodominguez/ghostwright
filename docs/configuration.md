# Configuration

All configuration is read from environment variables. For local development, copy
`.env.example` to `.env` and adjust as needed. The defaults there point at the local Docker
Compose stack.

## Data stores

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | libSQL endpoint for application data, for example `http://localhost:8080` |
| `DATABASE_AUTH_TOKEN` | No | Auth token for a hosted or secured libSQL instance |
| `REDIS_URL` | Yes | Redis connection for the job queue, for example `redis://localhost:6379` |

`REDIS_HOST` and `REDIS_PORT` are also honored if you prefer to set them separately instead of
`REDIS_URL`.

## Artifacts (S3 or MinIO)

| Variable | Required | Purpose |
| --- | --- | --- |
| `S3_ENDPOINT` | Yes | Object store endpoint the services talk to |
| `S3_PUBLIC_ENDPOINT` | No | Endpoint used when generating browser-facing URLs, if different |
| `S3_REGION` | No | Region, defaults to `us-east-1` |
| `S3_BUCKET` | Yes | Bucket that holds artifacts |
| `S3_ACCESS_KEY` | Yes | Access key |
| `S3_SECRET_KEY` | Yes | Secret key |

## Security

| Variable | Required | Purpose |
| --- | --- | --- |
| `GHOSTWRIGHT_SECRET_KEY` | Yes in production | Key used to encrypt stored passwords and TOTP seeds. Keep it stable, or existing secrets can no longer be decrypted. |
| `GHOSTWRIGHT_ACCESS_TOKEN` | No | If set, the dashboard requires this token. Leave unset for an open local instance. |
| `GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK` | No | When enabled, the worker refuses navigations to private network ranges to reduce SSRF risk. On by default. |

## AI

The AI features (failure triage, natural-language step resolution) are enabled when Claude
credentials are present.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | For AI | API key for Claude |
| `ANTHROPIC_AUTH_TOKEN` | Alternative | Auth token, as an alternative to an API key |
| `ANTHROPIC_PROFILE` | No | Named profile, if you use one |

## Email alerts

Needed only if you configure an email alert channel.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SMTP_URL` | For email | SMTP connection string |
| `SMTP_FROM` | For email | From address on alert emails |

## Worker and scheduler tuning

| Variable | Required | Purpose |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | No | How many runs the worker processes at once |
| `SCHEDULER_RECONCILE_MS` | No | How often the scheduler checks for due schedules |

## Observability

| Variable | Required | Purpose |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | No | Where to send OpenTelemetry traces |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Base OTLP endpoint, if you set one instead of the traces-specific variable |
| `LOG_LEVEL` | No | Log verbosity, for example `info` or `debug` |

## Dashboard and general

| Variable | Required | Purpose |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | No | Public URL of the dashboard, used in links and alerts |
| `NODE_ENV` | No | `development` or `production` |

## CLI

The CLI reads two variables so it can reach your instance from CI. See
[api.md](api.md) for details.

| Variable | Purpose |
| --- | --- |
| `GHOSTWRIGHT_API_URL` | Base URL of your Ghostwright instance |
| `GHOSTWRIGHT_API_KEY` | API key used to authenticate |
