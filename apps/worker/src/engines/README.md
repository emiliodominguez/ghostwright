# Browser engines

The worker drives tests through a browser engine. Playwright is the default and
full-featured engine. `rustwright.ts` is an experimental, opt-in second engine backed by
[rustwright](https://github.com/Skyvern-AI/rustwright), a Rust CDP core with a
Playwright-shaped Node binding.

## Why there is a limit on what rustwright can do

rustwright's Node binding is small and selector-string based. It exposes `chromium.launch`,
`browser.newPage`, and a page with `goto`, `click(selector)`, `fill(selector, value)`,
`textContent(selector)`, `evaluate`, `screenshot`, and `close`. It has no locator objects, no
browser contexts, and Chromium only.

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
- Targets that map cleanly to CSS: `css`, plus `testId`, `placeholder`, `altText`, and
  `title` getters

## What does not run (needs the Playwright engine)

The adapter throws a clear `EngineUnsupportedError` naming the feature, so an unsupported test
fails fast instead of behaving oddly:

- Targeting by role, accessible name, visible text, or field label
- XPath and `aria-ref` selectors, and the which-one (nth) selector
- Double-click, hover, press a key, choose from a dropdown, drag and drop, scroll to an
  element, file uploads, go back
- The AI step (needs Playwright's accessibility snapshot)
- Element screenshots (used by visual checks)

Engine-level features rustwright has no equivalent for: browser contexts, tracing (the
trace.zip that powers the embedded trace viewer), video recording, HAR capture, login session
capture (`storageState`), and Firefox or WebKit.

## Status

`rustwright.ts` implements and verifies the supported subset: a compiled login test (CSS
targeting, custom-code assertion, URL assertion, screenshot) runs end to end on rustwright,
and unsupported steps throw the clear error above.

Still to do: wire engine selection into `run.ts` so a run can opt into rustwright, gate the
context, tracing, recording, and login-session steps on the engine's capabilities, and skip
the trace, video, and HAR artifacts when they are not produced.
