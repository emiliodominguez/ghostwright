# @ghostwright/cli

Run Ghostwright tests from CI and fail the build on a failing test.

```bash
export GHOSTWRIGHT_API_URL=https://ghostwright.example.com
export GHOSTWRIGHT_API_KEY=gw_xxx
ghostwright test execute <testId> --error-on-fail
```

Flags: `--error-on-fail` (exit 1 if the test fails), `--error-on-screenshot-fail`
(exit 1 on a visual-diff failure), `--immediate` (don't wait), `--json`.

## GitHub Actions

```yaml
- name: Ghostwright smoke test
  run: npx @ghostwright/cli test execute ${{ vars.GW_TEST_ID }} --error-on-fail
  env:
    GHOSTWRIGHT_API_URL: ${{ vars.GW_API_URL }}
    GHOSTWRIGHT_API_KEY: ${{ secrets.GW_API_KEY }}
```
