---
id: 4
title: Document filterModel auto-detection behavior
status: approved
depends_on:
  - 1
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

Covers AC 11 and preserves the out-of-scope decision not to introduce `summarizationModel`.

**Justification:** Documentation-only change. The observable runtime behavior is covered by Tasks 1–3 and existing filter/config tests.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**
In the `README.md` Configuration section, update the `filterModel` config option row from:

```md
| `filterModel` | Cheap model used by `fetch_content({ prompt })` |
```

to:

```md
| `filterModel` | Summarization/filter model used by `fetch_content({ prompt })`, in `provider/model-id` format |
```

Then add this paragraph immediately after the config options table:

```md
Omit `filterModel` to let pi-web-tools auto-detect an available cheap filter model from its built-in candidate list. The config field is intentionally named `filterModel`; there is no separate `summarizationModel` setting.
```

**Step 2 — Verify**
Run: `npm run build`
Expected: TypeScript build succeeds and README now documents `filterModel`, the `provider/model-id` format, and omit-to-auto-detect behavior.
