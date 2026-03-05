---
id: 13
type: feature
status: done
created: 2026-03-04T21:50:19.465Z
sources: [2, 3]
---
# Lean context: summary search + file-first storage
Two complementary changes that shrink what enters the main model's context. #2 switches search results from verbose highlights to 1-line summaries (5-15K → 1-2K). #3 makes raw fetches always write to file with a preview instead of inlining up to 30K. Together they complete the v2.0 architecture shift.
