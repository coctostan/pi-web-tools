# Implement Task 1 — Add filterModel field to config

## Summary
Implemented support for `filterModel` in configuration loading and defaults.

## Changes
- `config.test.ts`
  - Added tests:
    - reads `filterModel` from config when present
    - defaults `filterModel` to `undefined` when missing
- `config.ts`
  - Added `filterModel?: string` to `WebToolsConfig`
  - Added `filterModel: undefined` to `DEFAULT_CONFIG`
  - Parsed `filterModel` in `buildConfig()` (string containing `/` only)
  - Returned `filterModel` from `buildConfig()`

## TDD Evidence
- RED: `npx vitest run config.test.ts` → failed (`expected undefined to be 'anthropic/claude-haiku-4-5'`)
- GREEN: `npx vitest run config.test.ts` → passed (15/15)
- Regression check: `npx vitest run` → passed (112/112)
