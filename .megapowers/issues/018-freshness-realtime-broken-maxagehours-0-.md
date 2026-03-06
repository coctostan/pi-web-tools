---
id: 18
type: bugfix
status: done
created: 2026-03-06T14:40:07.204Z
priority: 2
---
# freshness: "realtime" broken — maxAgeHours: 0 is ignored by Exa
## Bug

`freshness: "realtime"` maps to `maxAgeHours: 0` via `FRESHNESS_MAP` in `tool-params.ts`. Exa API treats `maxAgeHours: 0` as "no filter" (same as omitting the field), so `"realtime"` is functionally identical to `"any"` — stale results from years ago still come through.

**Confirmed in session test:** `freshness: "realtime"` returned a blog post from 2022.

## Root cause

`tool-params.ts`:
```ts
const FRESHNESS_MAP: Record<string, number | undefined> = { realtime: 0, day: 24, week: 168, any: undefined };
```

`exa-search.ts`:
```ts
if (options.maxAgeHours !== undefined) {
  requestBody.maxAgeHours = options.maxAgeHours;
}
```

`maxAgeHours: 0` passes the `!== undefined` check so it IS sent to Exa — Exa just ignores or misinterprets 0 as "no limit."

## Fix options

1. Map `"realtime"` to `1` (last hour) or `0.5` (last 30 min) — small but non-zero
2. Remove `"realtime"` from the enum and update docs to note the smallest useful value is `"day"`
3. Keep `"realtime"` but use `type: "news"` + no maxAgeHours as a proxy for freshest results

Option 1 is simplest. Option 2 is most honest. Recommend option 2 + update docs.

## Files

- `tool-params.ts` — `FRESHNESS_MAP`
- `README.md` — freshness docs
- `tool-params.test.ts` — add test asserting `realtime` does NOT map to 0
