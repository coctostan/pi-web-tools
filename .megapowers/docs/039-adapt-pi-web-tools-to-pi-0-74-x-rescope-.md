# Bugfix: adapt pi-web-tools to pi 0.74.x / @earendil-works rescope

Closes batch #039 (source issues #026, #027, #028, #029, #030).

## Root cause

`pi-web-tools` had not adopted three coordinated breaking changes in the pi
ecosystem between v0.63 and v0.74:

1. **v0.63** — `ModelRegistry.getApiKey(model)` was replaced by
   `getApiKeyAndHeaders(model)` returning a `ResolvedRequestAuth` discriminated
   union (`{ ok: true; apiKey?; headers? } | { ok: false; error }`).
2. **v0.65** — `session_switch`, `session_fork`, and `session_tree` events were
   consolidated into a single `session_start` event with
   `reason: "startup" | "reload" | "new" | "resume" | "fork"`.
3. **v0.74** — the `@mariozechner/*` npm scope was republished as
   `@earendil-works/*`. The legacy scope is frozen at 0.73.x.

The repo's local test suite was deceptively green because the vendored
`.pi/npm/node_modules/@mariozechner/pi-coding-agent@0.73.0` snapshot still
exposed the old ABI. Against fresh pi (0.74), `fetch_content({prompt})`
silently fell back to raw extraction, `/new`/`/resume`/`/fork` did not flush
caches, and `npm install` left peer dependencies unresolvable.

## Fix approach

Single coordinated migration touching five surfaces:

- **`index.ts`** — drop dead `pi.on("session_switch"|"session_fork"|"session_tree", …)`
  registrations; switch remaining `pi.on("session_start", (event, ctx) => …)`
  to inspect `event.reason` so `"reload"` only restores from session (no
  URL/clone/temp wipe), while `"startup" | "new" | "resume" | "fork"` still
  trigger the full reset via `handleSessionStart`.
- **`filter.ts`** — `resolveFilterModel` now calls
  `registry.getApiKeyAndHeaders(model)` and propagates the `headers` channel
  (required for Anthropic OAuth, Cloudflare AI Gateway, Xiaomi). `FilterModelResult`
  ok-branch carries optional `headers`. `filterContent` threads
  `{ apiKey, headers }` into `completeFn`.

  Signature confirmed in source:

  ```
  export async function resolveFilterModel(
    registry: ModelRegistry,
    configuredModel?: string,
  ): Promise<FilterModelResult>
  ```

  where `FilterModelResult = { model; apiKey; headers? } | { model: null; reason }`.
- **`package.json`** — `peerDependencies` flipped to
  `@earendil-works/pi-coding-agent ^0.74.0`, `@earendil-works/pi-tui ^0.74.0`,
  `typebox ^1.1.0` (replacing the stale `@sinclair/typebox` peer; pi-ai 0.74
  re-exports `Type` from bare `typebox`). Version bumped to `4.0.0` (breaking
  per spec). All `.ts` source imports flipped to `@earendil-works/*`.
- **`README.md`** — replaced dead `nicholasgasior/pi-coding-agent` link with
  `earendil-works/pi-mono`. Added a Requirements section calling out pi 0.74
  + `@earendil-works/*` peer scope. Added "Requires pi 0.74 or newer" notes
  next to install commands. Documented the `.pi/npm` snapshot-refresh flow
  in the Development section. Added a `4.0.0` changelog entry.
- **`.pi/npm/`** — regenerated snapshot against `@earendil-works/*@^0.74`.
  `.pi/npm/package.json` now declares the new-scope deps explicitly so the
  snapshot is reproducible.

A new `scripts/smoke-load-extension.mjs` codifies the "all four tools register
and only the new lifecycle hooks are wired" smoke test against the refreshed
vendored snapshot.

## Files changed

- `index.ts` — session_start reason inspection, imports flipped, removed
  dead session event registrations.
- `filter.ts` — `getApiKeyAndHeaders`, headers threading, imports flipped.
- `package.json` — peerDependencies, version `4.0.0`, devDependencies
  bumped to `@earendil-works/*@^0.74.0`.
- `package-lock.json` — regenerated.
- `README.md` — links, Requirements, install notes, snapshot-refresh docs,
  `4.0.0` changelog.
- `index.test.ts` — five `session_start{reason}` tests replacing the single
  coarse test; new "legacy lifecycle events not registered" guard.
- `filter.test.ts` — covers ok:true, ok:true+headers, ok:false, error,
  short-response, empty-response.
- `scope-rescope.test.ts` (new) — grep-style guardrails on imports + manifest.
- `scripts/smoke-load-extension.mjs` (new) — `pi -e` equivalent smoke test.
- `.pi/npm/package.json`, `.pi/npm/package-lock.json`, `.pi/npm/node_modules/**`
  — refreshed vendored snapshot.

## How to verify

```bash
rm -rf node_modules && npm install
npm run build
npm test               # expect: Tests 269 passed (269)
npx tsc -p tsconfig.json --noEmit         # exit 0
npx tsx scripts/smoke-load-extension.mjs  # OK: extension registered code_search, fetch_content, get_search_content, web_search
npm pack --dry-run 2>&1 | grep -c mariozechner   # 0
```

Reproduction probe from `reproduce.md` (TypeScript compile against
`@earendil-works/pi-coding-agent@0.74.0`) now type-checks because
`session_switch`/`session_fork` calls and `registry.getApiKey` are gone from
source.
