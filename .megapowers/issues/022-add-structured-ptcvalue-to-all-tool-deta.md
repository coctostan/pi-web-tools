---
id: 22
type: feature
status: done
created: 2026-03-24T15:51:59.386Z
priority: 1
---
# Add structured ptcValue to all tool details for PTC interop
Add `details.ptcValue` to all 4 tool executors so PTC can consume web-tools results as structured data instead of parsing human-readable text.

PTC's `tool-adapters.ts` already checks for `details.ptcValue` and uses it directly when present (falls back to text parsing otherwise). This issue is about emitting those structured payloads from our side.

## Proposed shapes

**`web_search`:**
```ts
{
  results: Array<{ url: string; title: string; snippet: string; score?: number; publishedDate?: string }>;
  responseId: string;
  query: string;
  totalResults: number;
}
```

**`fetch_content`:**
```ts
{
  url: string;
  filePath?: string;        // for raw fetches (file-first)
  filteredAnswer?: string;  // for prompt-filtered fetches
  preview?: string;         // 500-char preview
  contentLength?: number;
  sourceType: "web" | "github" | "pdf";
}
```

**`code_search`:**
```ts
{
  snippets: Array<{ url: string; code: string; language?: string; title?: string }>;
  responseId: string;
  query: string;
}
```

**`get_search_content`:**
```ts
{
  url?: string;
  content: string;
  truncated: boolean;
  totalChars?: number;
  responseId: string;
}
```

## Also include
- Add `ptc` metadata (`callable: true`, `policy: "read-only"`) to all 4 tool definitions
- Add tests verifying ptcValue is present and correctly shaped in tool results
- Shapes above are proposals — finalize during planning
