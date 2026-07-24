# Configuration

All configuration is read from environment variables. For local development, copy
`.env.example` to `.env` and adjust as needed. The defaults there point at the local Docker
Compose stack.

## Data stores

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | libSQL endpoint for application data, for example `http://localhost:8180` |
| `DATABASE_AUTH_TOKEN` | No | Auth token for a hosted or secured libSQL instance |
| `REDIS_HOST` | No | Redis host for the job queue. Defaults to `127.0.0.1`. |
| `REDIS_PORT` | No | Redis port for the job queue. Defaults to `6379`. |

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
| `GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK` | No | Set to `1` so the worker refuses outbound requests to private, loopback, and link-local addresses (reduces SSRF risk on shared or hosted deployments). Off by default, since self-hosted single-tenant setups often need to reach internal apps. |

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

## Worker tuning

| Variable | Required | Purpose |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | No | How many runs the worker processes at once |

## Logging

| Variable | Required | Purpose |
| --- | --- | --- |
| `LOG_LEVEL` | No | Log verbosity: `debug`, `info`, `warn`, `error`, or `silent`. Defaults to `info`. |

## Dashboard and general

| Variable | Required | Purpose |
| --- | --- | --- |
| `WEB_PORT` | No | Port the dashboard listens on. Defaults to `4321`. |
| `PUBLIC_BASE_URL` | No | Public URL of the dashboard, used in links and alerts |
| `NODE_ENV` | No | `development` or `production` |
