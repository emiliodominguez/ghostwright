# rustwright engine: gaps in this branch

This branch (`refactor/rustwright-engine`) adds rustwright as an experimental, opt-in second
browser engine. It does not replace Playwright, and it is not finished. This document lists
what is missing, what is approximate, and what it would take to close each gap.

For the supported vs unsupported summary, see `apps/worker/src/engines/README.md`. This file
is the honest list of everything that is not done or not equivalent.

## Status in one line

The rustwright engine is wired into the worker and opt-in through
`GHOSTWRIGHT_ENGINE=rustwright`. It has been run end to end through the real queue and worker.
Playwright stays the default and full-featured engine, and large parts of the platform still
cannot run on rustwright at all.

## 1. Integration and how to select the engine

The adapter is wired into `apps/worker/src/run.ts`. Set `GHOSTWRIGHT_ENGINE=rustwright` on the
worker to run every job on rustwright; leave it unset (the default) for Playwright. When
rustwright is selected the worker skips the browser context and everything that hangs off it
(tracing, video, HAR, storageState, per-test viewport, user agent, locale, HTTP basic auth,
extra headers, and the page-error hook) and uses the adapter's page and `expect`. The trace,
video, and HAR uploads are skipped, so those artifact keys stay null.

Integration nuances that remain:

- Engine selection is worker-wide (an env var). There is no per-test or per-run choice, and no
  way to pick the engine from the dashboard.
- The results page already tolerates missing trace, video, and HAR (it renders no broken
  links), but it does not tell the viewer which engine produced the run.
- `failOnJsError` is a no-op on rustwright (there is no page-error hook). The final URL is read
  live from the page at the end of a run, so it is correct even after a click-driven navigation.

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
  supports XPath), so they work for both actions and assertions. A raw `text=` selector typed
  into the CSS field is also converted to the same XPath, so it resolves consistently for both
  actions and assertions (rustwright's native engine handles `text=` for clicks, but the
  adapter's count and visibility checks go through `document.evaluate`, which does not).
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

`reload` is shimmed by navigating to the live current URL (read from the page, not a cached
value) rather than a true reload, so it lands on the right page but does not replay POST state.

## 5. Behavioral approximations

These work, but not identically to Playwright. They are the most likely source of subtle
differences.

- **Auto-waiting on actions.** Playwright waits for actionability before click and fill. The
  adapter relies on rustwright's own behavior and does not add Playwright-style actionability
  checks, so timing-sensitive interactions may behave differently.
- **Assertions.** The adapter provides its own retrying `expect` by polling every 100 ms. It
  honors the per-test element timeout setting (`elementTimeoutMs`), falling back to 5 seconds
  when the test does not set one.
- **Visibility.** The visible check is a heuristic (display, visibility, bounding box), matching
  Playwright in ignoring `opacity` (a fully transparent but laid-out element counts as visible).
  It is not Playwright's full visibility algorithm, so covered or clipped elements may be judged
  differently.
- **URL matching.** `toHaveURL` matches a string exactly and a RegExp as a substring, mirroring
  how the compiler encodes an exact-vs-substring assertion. `waitForURL` matches a string as a
  Playwright-style glob (`*` within a path segment, `**` across segments), so a plain path needs
  a `**` prefix to match a full URL, exactly as in Playwright.
- **`waitForLoadState`.** `load` and `domcontentloaded` poll `document.readyState` to the target
  state. `networkidle` is approximated with a fixed short delay, not real network-idle detection.
- **`waitForURL`.** Polled, not event-driven.
- **`url()`.** The synchronous `url()` returns the last URL known to the adapter, updated on
  `goto`, `reload`, and `waitForURL`. After a click that navigates it can still be stale, so the
  run's final URL, URL assertions, and `waitForURL` all read the live `location.href` instead of
  the cached value.
- **`evaluate`.** rustwright calls an evaluated string as a function, so the adapter wraps
  expressions as `() => (expr)` to match Playwright's string-as-expression behavior. Argument
  passing is not used, and complex return values are decoded by rustwright, so exotic return
  types may not round-trip exactly.
- **`textContent`.** Uses rustwright's selector-based `textContent`, which may differ from
  Playwright's locator `textContent` when a selector matches multiple elements. Text assertions
  (`toHaveText` / `toContainText`) collapse runs of whitespace and trim on both sides before
  comparing, matching Playwright's text normalization.

## 6. AI and visual checks

- The AI step needs Playwright's accessibility snapshot (`_snapshotForAI` and the `aria-ref`
  engine). It cannot run on rustwright and throws.
- Visual checks capture page-level screenshots, which rustwright supports, but per-element
  capture, a scoped selector, and ignore-regions rely on element-level features that are not
  available.

## 7. Verification gaps

- It has been run end to end through the real queue, worker, and database, and through compiled
  tests covering css, xpath, text, label, and exact targeting plus custom-code and URL
  assertions. The Playwright-parity behaviors (exact `toHaveURL`, glob `waitForURL`, opacity in
  the visibility check, `text=` on assertions, whitespace-normalized text, the honored element
  timeout, live-URL reload, and `waitForLoadState` readiness) were verified against a live
  rustwright browser.
- It is not yet covered by an automated test in the suite, and there is no test asserting that
  each unsupported step throws.
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

Done on this branch:

- Engine selection via `GHOSTWRIGHT_ENGINE`, defaulting to Playwright.
- `run.ts` gates context creation, tracing, video, HAR, `storageState`, and the `expect`
  source on the engine, and skips the trace, video, and HAR uploads on rustwright.

Still to do:

1. Per-test or per-run engine selection, and a way to pick it from the dashboard.
2. Surface the engine on the results page, and warn before a run when a test uses steps the
   selected engine cannot run.
3. Decide the product story for authenticated tests, the AI step, and visual checks on
   rustwright (most likely: mark them unsupported in the UI).
4. Add automated tests for the adapter, including the unsupported-step errors.
5. Sort out browser provisioning and container support for a rustwright-only deployment.
