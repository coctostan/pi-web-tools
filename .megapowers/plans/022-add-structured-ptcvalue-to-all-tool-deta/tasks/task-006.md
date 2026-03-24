---
id: 6
title: Verify all existing tests pass and ptcValue is JSON-serializable
status: approved
depends_on:
  - 2
  - 3
  - 4
  - 5
no_test: true
files_to_modify:
  - ptc-value.test.ts
files_to_create: []
---

### Verification

1. Run `npm test` — all 198+ existing tests must pass
2. Add a final integration-style test that verifies all ptcValue objects are `JSON.parse(JSON.stringify(value))` round-trippable
3. Verify no existing `details` fields were removed or renamed

This is a verification task, not a new feature task.
