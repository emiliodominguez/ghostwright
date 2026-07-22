# API and CLI

Ghostwright has a versioned REST API for automation and a small CLI that wraps it for CI.

## Authentication

The REST API is authenticated with API keys. Send the key one of two ways:

- An `Authorization: Bearer <key>` header (preferred).
- An `?apiKey=<key>` query parameter.

Keys are stored in the database. Requests without a valid key get `401 Unauthorized`.

## REST endpoints

Base path: `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/tests` | List tests |
| `GET` | `/tests/:id` | Get a single test |
| `POST` | `/tests/:id/execute` | Run a test |
| `GET` | `/tests/:id/results` | List results for a test |
| `GET` | `/results/:id` | Get a single run result |
| `POST` | `/tests/import` | Import a test |

### Running a test

`POST /api/v1/tests/:id/execute` starts a run.

By default it waits for the run to finish and returns the result. Executing is
side-effecting, so this endpoint is POST only and will not respond to a GET or a prefetch.

Add `?immediate=1` to return right away with the run id and a `queued` status. Poll
`GET /api/v1/results/:id` for the outcome.

Example:

```bash
# Wait for the result
curl -X POST \
  -H "Authorization: Bearer $GHOSTWRIGHT_API_KEY" \
  https://ghostwright.example.com/api/v1/tests/<testId>/execute

# Fire and forget, then poll
curl -X POST \
  -H "Authorization: Bearer $GHOSTWRIGHT_API_KEY" \
  "https://ghostwright.example.com/api/v1/tests/<testId>/execute?immediate=1"
```

## CLI

The CLI is published as `@ghostwright/cli`. It runs a test and can fail the build when the
test fails, which makes it a good fit for CI smoke tests.

```bash
export GHOSTWRIGHT_API_URL=https://ghostwright.example.com
export GHOSTWRIGHT_API_KEY=gw_xxx

npx @ghostwright/cli test execute <testId> --error-on-fail
```

### Flags

| Flag | Effect |
| --- | --- |
| `--api-url <url>` | Instance URL, or set `GHOSTWRIGHT_API_URL` |
| `--api-key <key>` | API key, or set `GHOSTWRIGHT_API_KEY` |
| `--error-on-fail` | Exit with code 1 if the test fails |
| `--error-on-screenshot-fail` | Exit with code 1 on a visual-diff failure |
| `--immediate` | Do not wait for the result |
| `--json` | Print the result as JSON |

### GitHub Actions

```yaml
- name: Ghostwright smoke test
  run: npx @ghostwright/cli test execute ${{ vars.GW_TEST_ID }} --error-on-fail
  env:
    GHOSTWRIGHT_API_URL: ${{ vars.GW_API_URL }}
    GHOSTWRIGHT_API_KEY: ${{ secrets.GW_API_KEY }}
```

## MCP server

The `@ghostwright/mcp` package is a Model Context Protocol server. It lets an AI agent list
tests and trigger runs through the same API, so an assistant can run a check and read the
result as part of a larger task.
