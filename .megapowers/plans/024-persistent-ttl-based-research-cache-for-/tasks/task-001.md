---
id: 1
title: "research-cache.ts: getCacheKey hashes url+prompt+model"
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - research-cache.ts
  - research-cache.test.ts
---

### Task 1: research-cache.ts: getCacheKey hashes url+prompt+model

**Files:**
- Create: `research-cache.ts`
- Create: `research-cache.test.ts`

**Step 1 — Write the failing test**

```typescript
// research-cache.test.ts
import { describe, it, expect } from "vitest";
import { getCacheKey } from "./research-cache.js";

describe("research-cache", () => {
  describe("getCacheKey", () => {
    it("returns a SHA-256 hex hash of url+prompt+model", () => {
      const key = getCacheKey("https://example.com", "What is X?", "anthropic/claude-haiku-4-5");
      // SHA-256 hex is 64 chars
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it("returns the same key for identical inputs", () => {
      const k1 = getCacheKey("https://example.com", "prompt", "model");
      const k2 = getCacheKey("https://example.com", "prompt", "model");
      expect(k1).toBe(k2);
    });

    it("returns different keys when url differs", () => {
      const k1 = getCacheKey("https://a.com", "prompt", "model");
      const k2 = getCacheKey("https://b.com", "prompt", "model");
      expect(k1).not.toBe(k2);
    });

    it("returns different keys when prompt differs", () => {
      const k1 = getCacheKey("https://a.com", "prompt1", "model");
      const k2 = getCacheKey("https://a.com", "prompt2", "model");
      expect(k1).not.toBe(k2);
    });

    it("returns different keys when model differs", () => {
      const k1 = getCacheKey("https://a.com", "prompt", "model-a");
      const k2 = getCacheKey("https://a.com", "prompt", "model-b");
      expect(k1).not.toBe(k2);
    });
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `Error: Missing "./research-cache.js" specifier` or `getCacheKey is not a function`

**Step 3 — Write minimal implementation**

```typescript
// research-cache.ts
import { createHash } from "node:crypto";

export interface CacheEntry {
  key: string;
  url: string;
  prompt: string;
  model: string;
  answer: string;
  fetchedAt: number;
  ttlMinutes: number;
}

export function getCacheKey(url: string, prompt: string, model: string): string {
  return createHash("sha256").update(`${url}\n${prompt}\n${model}`).digest("hex");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
