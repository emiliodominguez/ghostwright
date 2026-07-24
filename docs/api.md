# API

Ghostwright has a versioned REST API for automation.

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
