# Features

A guide to what Ghostwright does, organized by the surfaces you use day to day. For
building the steps inside a test, see [authoring.md](authoring.md). For the REST API, see
[api.md](api.md).

- [Tests](#tests)
- [Organizing tests](#organizing-tests)
- [Runs](#runs)
- [Sessions (login flows)](#sessions-login-flows)
- [Secrets](#secrets)
- [Actions](#actions)
- [Scheduling](#scheduling)
- [Alerts](#alerts)
- [Visual regression](#visual-regression)
- [Data-driven tests](#data-driven-tests)
- [Browsers and run settings](#browsers-and-run-settings)

## Tests

A test is a named list of steps. You build one on the home page: add steps from a
searchable menu, fill in a few fields per step, name it, and save. Each step reads two ways
at once: a plain-language sentence for everyone, and editable code behind a **See the code**
toggle for developers. See [authoring.md](authoring.md) for the full list of step types and
how to target elements.

Editing is versioned. Saving a change to a test's steps creates a new immutable version and
points the test at it; past runs keep the exact version they ran against, so history stays
intact.

**On the home page**, the "Your tests" list links to each test. Each row carries a small
**status dot** on the left showing how the test's most recent run ended, using the same
colors as run badges: green for passed, red for failed, amber for something went wrong,
a pulsing blue for a run in progress, and a hollow dot for a test that has never run.
Hovering the dot shows the last-run status in words.

Each row has a **⋯ actions menu** with **Run now**, **Edit**, **Move to folder**, and
**Delete**. Editing opens the step builder in a modal; deleting removes the test and
everything under it (runs, results, versions, schedules, baselines) after an inline
confirmation. See [Organizing tests](#organizing-tests) for folders, search, and running
several tests at once.

**On a test's page** you get **Edit** and **Delete**, a **Run now** button, and
collapsible panels for **Steps**, **Settings**, **Data**, and **Alerts**, followed by
**Recent runs**.

## Organizing tests

The home-page test list is a folder tree with search, built for keeping a large suite
tidy.

**Folders.** Create a folder with **New folder** in the toolbar, or a subfolder from a
folder's own hover actions. Folders nest to any depth. A folder header shows how many
items sit directly under it and has hover actions to add a subfolder, rename it, or
delete it. Deleting a folder never deletes tests: its tests and subfolders move up to the
deleted folder's parent. Renaming and creating folders use an in-app dialog.

**Collapse state is remembered.** Collapsing or expanding a folder is saved on the server,
so the tree renders the same way on your next visit. Because it is resolved server-side,
there is no flash of the wrong state on load.

**Move a test.** A test's **⋯ menu → Move to folder** lists every folder as a path (for
example `React / Authentication`) plus **Unfiled** for the top level.

**Search.** Type in the toolbar search box to filter by test name. Searching flattens the
tree to a flat list of matching tests across all folders; clearing it restores the tree.

**Running several tests at once.** Hover any row (or the toolbar) to reveal selection
checkboxes. Tick individual tests, tick a folder's checkbox to select everything under it
(including nested subfolders), or use the toolbar checkbox to select all visible tests.
Once anything is selected, a floating action bar shows the count with **Clear** and
**Run N**. Running enqueues a run for every selected test at once, so a folder full of
tests can be launched together instead of one at a time.

## Runs

A run is one execution of a test's current version on one browser and viewport. Runs are
created two ways: **Run now** on a test page (single or bulk), or a call to the REST API.
Scheduled runs would need a scheduler process, which is not currently included.

**Starting a run.** "Run now" enqueues a job and stays on the page, showing a spinner while
any run for that test is queued or running. If the test is data-driven or set to multiple
browsers, one run is created per browser × row.

**Isolation.** Runs execute in a global work queue (its size is configurable, five by
default). Each run gets its own fresh browser, browser context, and page, so no browser
state leaks between runs. On top of that, runs are serialized **per target application**:
any two runs that hit the same app (matched by the base URL host) run one at a time, so
tests that share server-side state cannot clobber each other, while runs against different
apps still run in parallel. When a run's target app is busy, its job waits briefly and
frees its slot for a run against a different app.

**Recent runs.** Each test page lists its runs, newest first, with a status badge (Passed,
Failed, Something went wrong, Waiting to start, Running). The list updates live. A run you
start shows up and moves through queued → running → finished without a manual refresh. Hover
a row to reveal an inline **delete** control.

**The run page** shows everything captured for a run:

- A status badge, and summary stats: duration, steps passed, browser, viewport, and start
  time. While a run is in progress the page updates in place: the duration ticks live and
  each step turns green or red as it finishes, and reconciles to the exact wall-clock time
  when the run ends.
- Each **step** with its status, duration, and any error. Failed steps show the error inline.
- **Visual diffs** for any visual-check step, with baseline, actual, and diff images, and an
  **approve baseline** control.
- **Artifacts**: a full-page screenshot, the video, the HAR, and the Playwright **trace**.
  The trace viewer is embedded. Click to load it and replay the run frame by frame, with DOM
  snapshots, network, and console.
- **AI triage** (when AI is enabled): a short summary of the likely cause and a suggested fix.

**Retry.** A finished run that failed or errored shows a **Retry** button in the header. It
starts a fresh run on the same version, browser, and viewport, resolving the login flow from
the test's settings, and takes you to the new run. The original run is left untouched as
history. A retry does not re-apply a data-driven row's variables, since those are not stored
on the run, so retry a data-driven case from the test's **Run now** if you need the row data.

**Delete.** Both the run page and each Recent-runs row have a **delete** control. Deleting a
run removes its step results, its artifacts in the object store, and the run row. It is
irreversible and confirmed inline.

## Sessions (login flows)

To test pages behind a login, record the login once and reuse its session. This lives on the
**Logins** page.

1. **Build a login flow.** Add the steps that sign in: go to the login page, type the
   credentials, submit, and end with a check that confirms you are in (for example, a
   heading or nav item that only appears when signed in, which is what catches a failed
   login). Use `{{secret.NAME}}` for the password and the **Enter a 2-factor code** step for
   TOTP.
2. **Capture the session.** Capturing runs the flow once and stores the resulting browser
   session (cookies and storage), encrypted at rest. The flow card shows a concise capture
   status and how many cookies were saved. Each attempt is recorded as a **capture run** you
   can open to debug: it lists every step with its status and screenshots, and includes a
   Playwright trace, exactly like a test run. When a capture fails, open its capture run to
   see which step broke and replay the trace, rather than reading a raw error on the card.
3. **Bind it to a test.** In a test's **Settings**, choose the login flow. Runs of that test
   then start already signed in. The captured session is injected before the first step, so
   the test itself does not repeat the login.

**Re-capture** whenever the session expires or you change the flow's steps (editing the steps
clears the stored session, since the old cookies may no longer match). If a run redirects to
a login page mid-test, the worker re-captures the bound flow once and retries automatically.

On the Logins page each flow card has inline **edit** and **delete**, a **Re-capture
session** (or **Capture session**) button, and a **Show steps** toggle.

## Secrets

Secrets are encrypted credentials referenced by name, so a password or 2-factor seed never
appears in a test's steps or in run output. They live on the **Secrets** page and are scoped
to the instance.

Two kinds:

- **Password / value**: any secret string. Reference it in any step's text field as
  `{{secret.NAME}}`, for example a password in a login flow.
- **2-factor seed (base32)**: a TOTP seed. Reference it from the **Enter a 2-factor code**
  step, which generates the current code and types it in. Seeds are normalized (spaces
  stripped, uppercased) before storage.

Add a secret from the form on the Secrets page. Values are stored encrypted with AES-256-GCM
and are **never shown again** after saving. To change one, delete it and add it anew. Errors
that Ghostwright persists (step and run errors, exports, alerts) have secret values redacted.

Deleting a secret is immediate. Any step that referenced it will fail to resolve on the next
run, so update the tests that used it.

## Actions

An action is a reusable group of steps: a login sequence, a "dismiss the cookie banner"
routine, a repeated navigation. Build one on the **Actions** page the same way you build a
test.

Once saved, an action appears in a test's **Add step** menu. When you insert it you choose
how it is included:

- **Link** it, so edits to the action flow through to every test that uses it. The test
  references the action; at run time its steps are expanded in place.
- **Copy** it in as editable steps, decoupled from the action.

The Actions page shows each action with a step-count and a preview of its steps, plus inline
**edit** and **delete**. Editing an action updates it everywhere it is linked.

## Scheduling

Scheduling exists only as groundwork right now, not as a usable feature. The data model and
the internal API for cron schedules are in place (a test can hold one or more cron
expressions with a timezone), but there is **no UI to create a schedule** and **no scheduler
process to run one**. So nothing runs on a cadence today.

Trigger runs yourself with **Run now** (single or bulk) or through the REST API. Turning
scheduling into a real feature would mean adding both a way to define schedules in the
dashboard and a scheduler process to reconcile them into runs.

## Alerts

Alerts notify you when a test's outcome warrants it. Configure them in a test's **Alerts**
panel. Each alert has a channel and a trigger.

**Channels**: Slack, webhook, Microsoft Teams, PagerDuty, and email. (Email requires SMTP
configuration; see [configuration.md](configuration.md).)

**Triggers**:

- **On failure**: only when a run fails.
- **On every run**: pass or fail.
- **On change**: only when the status flips from the previous run (green → red or red →
  green), which keeps a flaky check from paging you every cycle.

Alerts are evaluated after each run and delivered to their channel. Error text in an alert has
secret values redacted.

## Visual regression

Any test can assert that a page still looks right with the **Compare against a saved look**
step (a visual check). The first run captures a baseline; later runs compare against it.

- Baselines are stored **per test and per viewport**, so a test that runs on multiple
  viewports keeps a baseline for each.
- Comparisons use a **tolerance** so trivial rendering differences do not fail the run.
- **Ignore regions** let you mask areas that change every run (a clock, an ad, a random
  avatar) so they do not trigger a diff.

When a visual check differs, the run page shows the baseline, the actual capture, and the
diff image side by side. If the change is intentional, click **approve baseline** on that
step to promote the new capture, and subsequent runs compare against it.

## Data-driven tests

Run the same test once per row of data. In a test's **Data** panel, paste **CSV** (headers on
the first row) or a **JSON** array of objects. Each row becomes one run, with its columns
bound to `{{variables}}` you can use in any step's text field, for example a different search
term or login per row.

Clearing the data returns the test to a single ungenerated run.

## Browsers and run settings

A test's **Settings** panel controls how the worker builds the browser context. Everything is
optional; unset fields keep Playwright's defaults.

| Setting | What it does |
| --- | --- |
| **Browsers** | Run on Chromium and/or Firefox. Each selected browser adds a run (default Chromium). WebKit is shown as coming soon and is temporarily disabled; a run that still references it falls back to Chromium. |
| **Viewport** | Window size, for example `1280x720`. |
| **Login flow** | The captured session to sign in with before the first step (see [Sessions](#sessions-login-flows)). |
| **Element timeout** | Max time to find an element before the step fails. |
| **Step delay** | A pause inserted after each step (useful for slow apps or demos). |
| **Retry on failure** | Re-run the whole test up to N extra times if it fails, with an optional delay between attempts. Cuts false positives from flaky pages. |
| **Step retries** | Default extra attempts for every step that throws; a step's own retry setting overrides this. |
| **Fail on JS error** | Fail the run if the page logs an uncaught JavaScript error. |
| **Language / user agent / basic auth / extra headers** | Locale, custom user-agent, HTTP basic-auth credentials, and additional request headers. |

These apply to every run of the test, including scheduled runs, API-triggered runs, and
retries.
