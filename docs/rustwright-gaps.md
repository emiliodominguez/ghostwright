# rustwright engine: gaps in this branch

This branch (`refactor/rustwright-engine`) adds rustwright as an experimental, opt-in second
browser engine. It does not replace Playwright, and it is not finished. This document lists
what is missing, what is approximate, and what it would take to close each gap.

For the supported vs unsupported summary, see `apps/worker/src/engines/README.md`. This file
is the honest list of everything that is not done or not equivalent.

## Status in one line

The engine adapter (`apps/worker/src/engines/rustwright.ts`) exists and is verified in
isolation, but nothing in the running app can use it yet, and large parts of the platform's
features cannot run on it at all.

## 1. Not integrated into the worker (biggest gap)

The adapter is standalone. It has been proven by a spike that compiles a DSL test and runs it
through the adapter directly. It is not wired into the actual run path.

- `apps/worker/src/run.ts` still always uses Playwright. There is no way to select rustwright
  for a run through the queue, the API, or the dashboard.
- There is no engine-selection mechanism (no env var, no per-test setting).
- `run.ts` unconditionally creates a browser context and starts tracing, video, and HAR
  recording, and injects Playwright's `expect`. None of that is gated on the engine, so it
  cannot currently branch to the rustwright path.
- `run.ts` reads the final URL from `page.url()` and uploads trace, video, and HAR artifacts.
  On rustwright those artifacts do not exist, so the upload and results flow would need to be
  engine-aware.

Closing this is the main remaining work and is the riskiest change, because `run.ts` is the
core of the worker.

## 2. Engine capabilities rustwright does not have

These are limits of rustwright's Node binding, not of the adapter. They cannot be shimmed.

- **Browser contexts.** rustwright uses `browser.newPage()` directly. There are no context
  options, so per-test viewport, user agent, locale, HTTP basic auth, and extra HTTP headers
  are all ignored or unsupported.
- **Tracing.** No `context.tracing`, so no `trace.zip`. The embedded Playwright trace viewer
  has nothing to show for a rustwright run.
- **Video.** No `recordVideo`.
- **HAR.** No `recordHar`.
- **Login session capture.** No `storageState`. Login flows cannot be captured or injected, so
  authenticated tests cannot run on rustwright at all.
- **Multiple browsers.** Chromium only. No Firefox or WebKit.

## 3. Element targeting gaps

rustwright's selector engine resolves CSS, XPath, and Playwright's `text=` engine. The adapter
uses that, so more of the DSL's targeting maps than a pure-CSS engine would allow.

- Supported: `css`, `xpath`, visible `text`, field `label`, `testId`, `placeholder`,
  `altText`, and `title`. Text and label are resolved through XPath (rustwright's engine
  supports XPath), so they work for both actions and assertions.
- Unsupported, throws a clear error: targeting by role or accessible name (rustwright has no
  `role=` engine, and accessible names cannot be expressed in CSS or XPath reliably),
  `aria-ref` selectors, and the which-one (nth) selector.
- Self-healing / backup selectors work when every selector involved is one of the supported
  strategies. If the primary or a fallback targets by role, it throws before healing can run.

Two matching caveats, since text and label go through XPath rather than Playwright's real
engines:

- Non-exact text matches any element whose normalized text contains the string, and picks the
  first such innermost element in document order. Ambiguous text (for example "Login" on a page
  that also has a "Login Page" heading) may match the heading instead of the button. Prefer
  exact text or a more specific target. This is close to, but not identical to, Playwright's
  text engine.
- Field label matching covers `label[for]`, a wrapping `label`, and `aria-label`. It does not
  cover every association Playwright's label engine handles.

Practical impact: the default no-code authoring model leans on role targeting, which does not
run on rustwright. Tests authored with CSS, XPath, text, or label targets do run.

## 4. Interaction gaps

These step types throw `EngineUnsupportedError` on rustwright:

- Double-click, hover, press a key (on an element or on the page), choose from a dropdown,
  drag and drop, scroll to an element, file uploads, and go back.
- Element screenshots (used by visual checks).

`reload` is shimmed by navigating to the last known URL rather than a true reload.

## 5. Behavioral approximations

These work, but not identically to Playwright. They are the most likely source of subtle
differences.

- **Auto-waiting on actions.** Playwright waits for actionability before click and fill. The
  adapter relies on rustwright's own behavior and does not add Playwright-style actionability
  checks, so timing-sensitive interactions may behave differently.
- **Assertions.** The adapter provides its own retrying `expect` by polling every 100 ms up to
  a fixed 5 second timeout. It does not honor the per-test element timeout setting.
- **Visibility.** The visible check is a heuristic (display, visibility, opacity, bounding
  box). It is not Playwright's full visibility algorithm, so covered or clipped elements may be
  judged differently.
- **`waitForLoadState('networkidle')`.** Approximated with a fixed short delay, not real
  network-idle detection. `load` and `domcontentloaded` rely on `goto`'s `waitUntil`.
- **`waitForURL`.** Polled, not event-driven.
- **`url()`.** The synchronous `url()` returns the last URL known to the adapter, updated on
  `goto`. After a click that navigates, it can be stale. URL assertions and `waitForURL` read
  the live `location.href` to avoid this, but any consumer of the synchronous `url()` (for
  example a final-URL field) can see a stale value.
- **`evaluate`.** rustwright calls an evaluated string as a function, so the adapter wraps
  expressions as `() => (expr)` to match Playwright's string-as-expression behavior. Argument
  passing is not used, and complex return values are decoded by rustwright, so exotic return
  types may not round-trip exactly.
- **`textContent`.** Uses rustwright's selector-based `textContent`, which may differ from
  Playwright's locator `textContent` for trimming or multiple matches.

## 6. AI and visual checks

- The AI step needs Playwright's accessibility snapshot (`_snapshotForAI` and the `aria-ref`
  engine). It cannot run on rustwright and throws.
- Visual checks capture page-level screenshots, which rustwright supports, but per-element
  capture, a scoped selector, and ignore-regions rely on element-level features that are not
  available.

## 7. Verification gaps

- The adapter is proven only by a manual spike (a compiled login test), not by an automated
  test in the suite.
- There is no test asserting that each unsupported step throws.
- It has not been run through the real worker, queue, and database path.
- rustwright is alpha (0.1.1). Behavioral parity with Playwright is not proven, so bugs in the
  engine itself are possible.

## 8. Dependency and deployment gaps

- In development, rustwright reuses the Chromium binary that Playwright installed (its
  `executablePath` resolves to the Playwright cache). A rustwright-only deployment without
  Playwright present has no defined way to provision a browser. This is not addressed.
- rustwright ships native `.node` binaries per platform. Compatibility with the worker's
  container base image has not been checked.
- The worker's `tsc` typecheck has pre-existing errors unrelated to this change and runs via
  `tsx` at runtime. The new engine file type-checks cleanly, but there is no CI gate for it.

## What it would take to finish

1. Add engine selection (env var and/or a per-test setting), defaulting to Playwright.
2. Refactor `run.ts` around an engine interface that reports capabilities, and gate context
   creation, tracing, video, HAR, `storageState`, and the `expect` source on those
   capabilities.
3. Make artifact upload and the results page engine-aware, so a rustwright run cleanly shows
   no trace, video, or HAR instead of broken links.
4. Decide the story for authenticated tests, the AI step, and visual checks on rustwright
   (most likely: mark them unsupported and surface that in the UI before a run starts).
5. Add automated tests for the adapter, including the unsupported-step errors.
6. Sort out browser provisioning and container support for a rustwright-only deployment.
