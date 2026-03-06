---
id: 17
type: feature
status: done
created: 2026-03-04T21:50:19.469Z
sources: [10, 11]
---
# Smart search: query enhancement + dedup
Two rule-based improvements to search quality — no model calls needed. #10 enhances queries (error detection → keyword mode, version appending, vague query expansion). #11 deduplicates results and strips noise from summaries. Both are post-processing, ~80 lines total.
