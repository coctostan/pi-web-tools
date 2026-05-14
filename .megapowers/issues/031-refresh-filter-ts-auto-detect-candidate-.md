---
id: 31
type: feature
status: done
created: 2026-05-13T15:45:10.549Z
priority: 4
---
# Refresh filter.ts auto-detect candidate model list
## Problem

`filter.ts:10-13` hardcodes two auto-detect candidates for the cheap filter model:

```ts
const AUTO_DETECT_MODELS = [
  { provider: "anthropic", modelId: "claude-haiku-4-5" },
  { provider: "openai",    modelId: "gpt-4o-mini" },
] as const;
```

Since this code was written:

- Anthropic shipped `claude-haiku-5` (cheaper, faster than `haiku-4-5` for filter-style extractive tasks).
- OpenAI has `gpt-4.1-mini` and `gpt-5-nano` in the same price tier as `gpt-4o-mini`.
- Pi has added several new low-cost providers (Xiaomi MiMo, Moonshot, Cloudflare Workers AI, Together AI) that could serve as a third tier of fallback when neither Anthropic nor OpenAI keys are present.

The README also hard-codes `anthropic/claude-haiku-4-5` as the documented default (`config.ts` and `README.md`).

## Acceptance criteria

- `AUTO_DETECT_MODELS` updated to a reviewed list of currently-best cheap models, with at least 3 candidates spanning multiple providers (one Anthropic, one OpenAI, one open-weights / low-cost).
- The configured-model path keeps working with arbitrary `provider/modelId` strings — no regression.
- `filter.test.ts` parameterized over the new list so it stays accurate as the list evolves.
- README default-model mention updated to whatever the first candidate is.

## Files likely touched

- `filter.ts`
- `filter.test.ts`
- `README.md` (config example), `config.ts` (default mention if any)

## Notes

Pure update; no API breakage. Safe to combine with the `getApiKeyAndHeaders` migration (#filter-migration) if convenient.

