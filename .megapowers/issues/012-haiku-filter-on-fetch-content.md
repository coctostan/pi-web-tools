---
id: 12
type: feature
status: in-progress
created: 2026-03-04T21:50:19.463Z
sources: [1]
---
# Haiku filter on fetch_content
The single highest-impact change in v2.0. Add `prompt` parameter to `fetch_content` that routes through a cheap model for 10-50x context reduction. Solo batch because it's the largest issue (M effort) and the foundation the other v2.0 changes build on.
