## Goal

Bump `package.json` version from `2.0.0` to `3.0.0` so the package can be republished to npm with all v3 features (ptcValue, research cache, standalone CLI).

## Mode

Direct requirements — the change is a single field update with no design ambiguity.

## Must-Have Requirements

- R1: `package.json` `version` field must be `3.0.0`.

## Optional / Nice-to-Have

None.

## Explicitly Deferred

None.

## Constraints

- C1: No other `package.json` fields should change.

## Open Questions

None.

## Recommended Direction

Change the `version` field in `package.json` from `"2.0.0"` to `"3.0.0"`. That's it.

## Testing Implications

- Verify `package.json` parses correctly and contains `"version": "3.0.0"`.
- Run the existing test suite to confirm nothing breaks.
