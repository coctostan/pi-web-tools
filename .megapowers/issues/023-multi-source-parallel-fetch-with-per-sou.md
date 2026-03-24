---
id: 23
type: feature
status: open
created: 2026-03-24T16:06:26.825Z
priority: 2
---
# Multi-source parallel fetch with per-source Haiku filtering
Add a multi-URL prompt mode to `fetch_content` that fetches N URLs in parallel, runs each through the Haiku filter with the same prompt, and returns a structured array of per-source focused answers.

## Motivation

When an agent needs to cross-reference multiple sources (docs, SO, GitHub issues), the current flow is serial fetch → full content in context → repeat. This bloats context by 30k+ tokens per source. Multi-source parallel fetch with per-source filtering reduces that to ~200-1000 chars per source — ~90% token savings.

## Proposed behavior

```ts
fetch_content({
  urls: ["https://docs.example.com/api", "https://stackoverflow.com/q/12345", "https://github.com/org/repo/issues/42"],
  prompt: "How do you configure authentication for library X?"
})
```

Returns:
```ts
{
  sources: [
    { url: "...", answer: "...", contentLength: 12500, sourceType: "web" },
    { url: "...", answer: "...", contentLength: 8200, sourceType: "web" },
    { url: "...", answer: "...", contentLength: 3400, sourceType: "web" }
  ],
  prompt: "How do you configure authentication for library X?"
}
```

## Key design points

- Parallel fetch using existing `p-limit(3)` infrastructure
- Each source gets independently Haiku-filtered with the same prompt
- Agent does the synthesis/comparison — extension just provides compact, parallel extraction
- Structured `ptcValue` included (builds on #022)
- Failures per-source don't block others (return error field for failed URLs)

## Not in scope

- No reasoning/comparison logic inside the extension
- No "consensus" or "disagreement" detection — that's the agent's job
