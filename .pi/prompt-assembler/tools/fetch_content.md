Fetch a known URL and extract readable content.

**Use when:**
- you already have a specific URL and want the page content
- you want focused Q&A over a page or GitHub repo via the `prompt` parameter

**Prefer over:**
- `web_search` only after discovery is done
- `get_search_content` when you want a fresh fetch rather than expanding a previous result handle

**Tips:**
- use `prompt` for targeted extraction instead of dumping full content
- use `urls` for parallel fetches
- raw fetches may truncate; use `get_search_content` or `read` the stored content for deeper inspection