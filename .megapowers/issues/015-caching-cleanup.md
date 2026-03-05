---
id: 15
type: feature
status: in-progress
created: 2026-03-04T21:50:19.467Z
sources: [6, 7]
---
# Caching & cleanup
Session-level URL cache (#6) avoids redundant fetches and enables re-filtering cached pages with new prompts. Cleanup pass (#7) removes dead code (`sessionActive`), centralizes magic numbers, and converts sync fs to async. Both are v2.1 polish that round out the hardening sprint.
