---
id: 14
type: feature
status: in-progress
created: 2026-03-04T21:50:19.466Z
sources: [4, 5]
---
# Network resilience: retry + parallel batch
Two small, independent improvements to Exa API call handling. #4 adds retry with exponential backoff for transient failures. #5 replaces the sequential batch query loop with `p-limit(3)` concurrency. Both touch the network layer, both are quick wins.
