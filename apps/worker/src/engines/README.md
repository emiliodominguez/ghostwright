# Browser engines

The worker drives tests through a browser engine. Playwright is the default and
full-featured engine. `rustwright.ts` is an experimental, opt-in second engine backed by
[rustwright](https://github.com/Skyvern-AI/rustwright), a Rust CDP core with a
Playwright-shaped Node binding.

## Why there is a limit on what rustwright can do

rustwright's Node binding is small and selector-string based. It exposes `chromium.launch`,
`browser.newPage`, and a page with `goto`, `click(selector)`, `fill(selector, value)`,
`textContent(selector)`, `evaluate`, `screenshot`, and `close`. Its selector engine resolves
CSS, XPath, and Playwright's `text=` engine. It has no locator objects, no browser contexts,
and Chromium only.

Ghostwright's step contract (`packages/dsl/src/runtime.ts`) is locator based and expects a
much larger surface, so the adapter can only map the part that fits.

## What runs on the rustwright engine

- Navigation: `goto` (with `waitUntil`)
- Interaction by CSS selector: `click`, `fill`
- Reading: `textContent`
- Custom code: run custom code, check with custom code, save a code result (`evaluate`)
- Assertions checkable in the page: text contains/equals, visible/hidden, present/absent,
  count, and URL. These retry like Playwright's `expect`.
- Waiting: fixed time, `waitForURL` (polled), `waitForLoadState` (approximated), and element
  `waitFor` (polled visibility)
- Screenshots: page and full-page
- Targeting: `css`, `xpath`, visible `text`, field `label`, `testId`, `placeholder`,
  `altText`, and `title`. Text and label are resolved through XPath, which rustwright's engine
  supports, so they work for both actions and assertions.

## What does not run (needs the Playwright engine)

The adapter throws a clear `EngineUnsupportedError` naming the feature, so an unsupported test
fails fast instead of behaving oddly:

- Targeting by role or accessible name (rustwright has no `role=` engine and CSS/XPath cannot
  express accessible names reliably)
- `aria-ref` selectors and the which-one (nth) selector
- Double-click, hover, press a key, choose from a dropdown, drag and drop, scroll to an
  element, file uploads, go back
- The AI step (needs Playwright's accessibility snapshot)
- Element screenshots (used by visual checks)

Engine-level features rustwright has no equivalent for: browser contexts, tracing (the
trace.zip that powers the embedded trace viewer), video recording, HAR capture, login session
capture (`storageState`), and Firefox or WebKit.

## Status

The engine is wired into the worker. Set `GHOSTWRIGHT_ENGINE=rustwright` to run jobs on it;
leave it unset for the default Playwright engine. `run.ts` gates the context, tracing,
recording, and login-session steps on the engine and skips the trace, video, and HAR artifacts
on rustwright.

Verified end to end through the real queue and worker, and through compiled tests covering
css, xpath, text, label, and exact targeting plus custom-code and URL assertions. Unsupported
steps throw the clear error above.

The remaining work (per-test engine selection, showing the engine in the UI, automated tests,
and browser provisioning for a rustwright-only deployment) is tracked in
[docs/rustwright-gaps.md](../../../../docs/rustwright-gaps.md).
