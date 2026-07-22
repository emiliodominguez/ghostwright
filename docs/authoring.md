# Authoring tests

A test is a list of steps. Each step is stored in a typed format (the DSL) and shown two
ways: as a plain-language sentence for everyone, and as editable code for developers. You
build a test by adding steps from a searchable menu, filling in a few fields per step, and
naming it.

This document covers the step types, how to target elements, variables and secrets, custom
code, and reusable actions.

## Step types

Steps are grouped the same way the Add step menu groups them.

### Navigate

| Step | What it does |
| --- | --- |
| Go to a web page | Navigate to a URL |
| Go back | Go back to the previous page |
| Refresh the page | Reload the current page |
| Scroll | Scroll to the bottom, or to a specific element |

### Interact

| Step | What it does |
| --- | --- |
| Click something | Click, double-click, or right-click an element |
| Type some text | Type into a field |
| Choose from a dropdown | Select one or more options |
| Hover over something | Move the pointer onto an element |
| Press a key | Press a keyboard key |
| Drag and drop | Drag one element onto another |
| Upload a file | Attach files to a file input |
| Enter a 2-factor code | Generate a TOTP code from a stored secret and type it in |

### Check (assertions)

| Step | What it does |
| --- | --- |
| Check something is visible | Assert an element is visible |
| Check the text on the page | Assert an element contains or exactly matches text |
| Check the web address | Assert the URL contains or matches a value |
| Check something is hidden | Assert an element is not visible |
| Check something exists | Assert an element is present in the DOM |
| Check something is gone | Assert an element is not present |
| Check text is absent | Assert an element does not contain some text |
| Compare against a saved look | Visual regression check against a baseline |

### Wait

| Step | What it does |
| --- | --- |
| Wait (time or for an element) | Wait a fixed time, or for an element to reach a state |
| Wait for the web address | Wait until the URL matches a pattern |
| Wait for the page to settle | Wait for load, DOM ready, or network idle |

### Capture and data

| Step | What it does |
| --- | --- |
| Take a screenshot | Capture the page at this point |
| Save text into a variable | Read an element's text into a variable |
| Set a variable | Set a variable to a literal or a built-in value |

### AI and code

| Step | What it does |
| --- | --- |
| Describe it in plain words | Let the AI find the right element for a described action |
| Save a code result | Run JavaScript and store the returned value in a variable |
| Run custom code | Run JavaScript in the page |
| Check with custom code | Pass the step when your JavaScript returns a truthy value |
| Stop the test | End the test early as passed or failed |

A test can also reference a saved action, which runs that action's steps in place.

## Targeting elements

Most steps that act on an element let you choose how to find it. Simple options come first,
power options after.

| Strategy | Finds an element by |
| --- | --- |
| By kind and label | Its ARIA role plus an accessible name, for example the "Sign in" button |
| By visible text | The text it shows |
| By field label | A form field's label |
| By placeholder | A field's placeholder text |
| By test id | Its `data-testid` attribute |
| By image alt text | An image's alt text |
| By title | Its title attribute |
| By CSS selector | A CSS selector |
| By XPath | An XPath expression |

Every target has an advanced drawer with three extra controls:

- **Exact match.** Match the whole value instead of a substring.
- **Which one.** If several elements match, pick the nth one.
- **Backup selectors.** List alternative targets that are tried in order if the main one is
  not found. This is also what lets locators self-heal when a page changes.

## Variables and secrets

Any text field in a step can use `{{variable}}` placeholders.

- Variables you create with Set a variable or Save text into a variable.
- Columns from a data-driven test, one row per run.
- Secrets, referenced as `{{secret.NAME}}`. Secrets are stored encrypted and are never shown
  again after you save them.
- Built-ins such as `{{timestamp}}`, `{{internet.email}}`, and `{{name.firstName}}` for
  generating throwaway values.

## Custom code

Three steps run JavaScript, and they use an embedded editor with syntax highlighting:

- **Run custom code** runs JavaScript in the page. It has access to `window` and `document`.
- **Check with custom code** passes the step when the code returns a truthy value.
- **Save a code result** runs code and stores what it returns in a variable.

There is also a See the code toggle on the whole test, which shows the generated script for
all steps.

## Reusable actions

Save a group of steps as an action (a login flow is the common case) and it appears in the
Add step menu. When you insert an action you can either link it, so edits to the action flow
through to every test that uses it, or copy it in as editable steps.

## Logging in to your app

To test pages behind a login:

1. Build a login flow on the Logins page: go to the login page, type the credentials, submit,
   and end with a check that confirms you are in.
2. Use `{{secret.NAME}}` for the password and the Enter a 2-factor code step for TOTP.
3. Capture the flow. Ghostwright runs it once and stores the resulting session.
4. Bind the login flow to a test in that test's Settings. Runs then start already signed in.
