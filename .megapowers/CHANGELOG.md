## [Unreleased]

### Added
- `prompt` parameter on `fetch_content`: filters page content through a cheap model (Haiku / GPT-4o-mini) and returns a focused answer (~200-1000 chars) instead of full raw content (~5-30K chars). Achieves 10-50x context reduction per fetch call. Auto-detects available filter model; gracefully falls back to raw content with a `⚠` warning when no model is available or the API call fails. Multi-URL fetches are filtered in parallel using `p-limit(3)`. (#012)
- `filterModel` field in `~/.pi/web-tools.json` to explicitly configure the filter model in `"provider/model-id"` format (e.g. `"anthropic/claude-haiku-4-5"`). (#012)
