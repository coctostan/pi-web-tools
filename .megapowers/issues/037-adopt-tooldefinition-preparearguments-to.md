---
id: 37
type: feature
status: done
created: 2026-05-13T15:50:54.040Z
priority: 4
---
# Adopt ToolDefinition.prepareArguments to centralize and TypeBox-validate tool input normalization
## Problem

`tool-params.ts` reimplements input normalization for each tool at runtime — coercing strings to arrays, defaulting `numResults`, mapping `freshness` → `maxAgeHours`, dedup'ing URLs, and so on. This pre-dates pi v0.63's `ToolDefinition.prepareArguments` hook, which:

1. Runs **before** TypeBox validation.
2. Takes raw `unknown` input from the LLM, returns a `Static<TParams>` shape.
3. Lets us declare a strict TypeBox schema and still accept loose model output.

Today the tool's `parameters` schema has nearly every field `Optional`, then `normalize*Input` enforces "really required" / "really optional" semantics at runtime. With `prepareArguments`, the schema can express the final shape and the prepare step can do the coercion in one declarative pass.

## Acceptance criteria

- Each `pi.registerTool({...})` call adopts `prepareArguments: (raw) => normalize*Input(raw)`.
- Where it's safe, tighten the visible schema (e.g., `WebSearchParams.numResults` becomes a constrained integer, `FetchContentParams` requires either `url` or `urls`).
- The `tool-params.ts` exports become the prepare functions; the runtime normalization is no longer duplicated inside `execute(...)`.
- All four tools' tests stay green; the prepare functions get their own focused tests (some already exist in `tool-params.test.ts`).

## Files likely touched

- `tool-params.ts` (signature changes — return `Static<TParams>` not just sanitized objects)
- `index.ts` (`registerTool` calls, slim `execute` bodies)
- `tool-params.test.ts`

## References

- Pi changelog v0.63.0 — `prepareArguments` hook
- `dist/core/extensions/types.d.ts` — `ToolDefinition.prepareArguments`

## Dependencies

- Better to land after the rescope (#028) so we're authoring against the modern type signatures.

