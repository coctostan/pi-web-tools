# Diagnosis

## Root Cause

`pi-web-tools` is pinned to the **deprecated `@mariozechner` npm scope and the
pre-0.65/pre-0.63 pi extension API**. The pi ecosystem made three coordinated
breaking changes between v0.63 and v0.74 that this repo never adopted:

1. **v0.63** — `ModelRegistry.getApiKey(model)` → `getApiKeyAndHeaders(model)`
   returning a `ResolvedRequestAuth` discriminated union.
2. **v0.65** — extension lifecycle events consolidated: `session_switch`,
   `session_fork` (and to a lesser extent `session_tree`) were collapsed into a
   single `session_start` event whose payload now carries a `reason` field
   (`"startup" | "reload" | "new" | "resume" | "fork"`) plus
   `previousSessionFile`.
3. **v0.74** — npm scope migration: `@mariozechner/pi-coding-agent`,
   `@mariozechner/pi-tui`, **and** `@mariozechner/pi-ai` were re-published as
   `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`,
   `@earendil-works/pi-ai`. The legacy scope is frozen at `0.73.x` and the
   `pi-coding-agent` `peerDependencies` block of any downstream extension must
   now resolve against the new scope.

This is not one bug; it is one coherent ecosystem migration that hits this repo
at five touchpoints (events, model auth, package scope, README docs, vendored
dev snapshot), which is why the upstream issue tracker split it into
#026–#030.

**Evidence (`@earendil-works/pi-coding-agent@0.74.0`)**

`package/dist/core/extensions/types.d.ts`:

```
export interface SessionStartEvent {
  type: "session_start";
  reason: "startup" | "reload" | "new" | "resume" | "fork";
  previousSessionFile?: string;     // present for new/resume/fork
}
export interface SessionShutdownEvent {
  type: "session_shutdown";
  reason: "quit" | "reload" | "new" | "resume" | "fork";
  targetSessionFile?: string;
}
// On the ExtensionAPI:
on(event: "session_start",     handler: ExtensionHandler<SessionStartEvent>): void;
on(event: "session_before_switch", handler: ...): void;
on(event: "session_before_fork",   handler: ...): void;
on(event: "session_shutdown",  handler: ExtensionHandler<SessionShutdownEvent>): void;
on(event: "session_tree",      handler: ExtensionHandler<SessionTreeEvent>): void;
// NO on("session_switch", ...) — that overload is gone.
// NO on("session_fork",   ...) — replaced by "session_before_fork".
```

`package/dist/core/model-registry.d.ts`:

```
export type ResolvedRequestAuth =
  | { ok: true; apiKey?: string; headers?: Record<string, string> }
  | { ok: false; error: string };

getApiKeyAndHeaders(model: Model<Api>): Promise<ResolvedRequestAuth>;
// getApiKey is gone; getApiKeyForProvider(provider: string) is retained for
// provider-level keys but is NOT what filter.ts is using.
```

`@earendil-works/pi-ai@0.74.0` (`package/dist/stream.d.ts:5`):

```
export declare function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: ProviderStreamOptions
): Promise<AssistantMessage>;
```

i.e. `pi-ai` is ALSO under the new scope at 0.74.0; the legacy
`@mariozechner/pi-ai` is frozen at 0.73.1. The current source imports
`from "@mariozechner/pi-ai"` (`index.ts:4`, `filter.ts:2`), which will keep
working only as long as the legacy registry entry survives.

`package.json` top-level metadata (`/tmp/pi-074-probe/package/package.json`)
shows the dependency line published by upstream — confirms the new scope is
the canonical home.

## Trace

The symptoms in the reproduction trace cleanly to two source files plus three
config/doc surfaces:

### Trace 1 — session lifecycle (`index.ts`, source issue #026)

Symptom: caches are not cleared on `/new`, `/resume`, or `/fork`.

```
extension is loaded
  pi-coding-agent emits one of: session_start{reason=new|resume|fork}
                                session_start{reason=startup|reload}
  (it no longer emits "session_switch", "session_fork", or "session_tree")
↓
index.ts:135 — pi.on("session_start", … handleSessionStart(ctx))
  HANDLES startup/reload/new/resume/fork — but with no reason inspection,
  it now wipes URL cache + temp files on benign "reload" events too.
↓
index.ts:139 pi.on("session_switch", …)  ← dead overload, TS2769 against 0.74
index.ts:143 pi.on("session_fork",   …)  ← dead overload, TS2769
index.ts:147 pi.on("session_tree",   …)  ← still typed but no longer fired
                                            for the user flows we care about
↓
handleSessionStart (index.ts:53)
  abortAllPending(); clearCloneCache(); clearUrlCache();
  cleanupTempFiles(); restoreFromSession(ctx)
```

`handleSessionStart` is otherwise correct — it does exactly what the issue
description wants — but every code path that used to lead to it via
`session_switch` / `session_fork` is now a dead registration in the 0.74 API.

### Trace 2 — filter model auth (`filter.ts`, source issue #027)

Symptom: `fetch_content({prompt})` silently falls back to raw extraction.

```
fetch_content tool handler
↓ (index.ts call site — filterContent(content, prompt, registry, configuredModel, complete))
filter.ts:64 filterContent(...)
↓
filter.ts:71  resolveFilterModel(registry, configuredModel)
↓
filter.ts:42  apiKey = await registry.getApiKey(model)
              filter.ts:55  apiKey = await registry.getApiKey(model)
              # 0.74.x: ModelRegistry has NO `getApiKey` method.
              # JS: TypeError "registry.getApiKey is not a function"
              #     → caught in try/catch? No — resolveFilterModel has
              #       no try/catch. The throw propagates to filterContent.
              # TS: TS2339 Property 'getApiKey' does not exist on type 'ModelRegistry'
↓
filter.ts:72  if (!resolved.model || !("apiKey" in resolved))
              returns { filtered: null, reason: ... }
↓
filter.ts:89  await completeFn(model, context, { apiKey })
              Headers (Anthropic OAuth, Cloudflare AI Gateway, Xiaomi) are
              never threaded through — so even after we fix the call, the
              "ok: true" branch must propagate `headers` or those providers
              break.
```

The function that "throws" (`resolveFilterModel`) is exactly the call site,
not a deeper helper — so the root cause and the failure point coincide here.
The wider issue is the `headers` channel: the new `ResolvedRequestAuth`
contract explicitly carries headers because some auth modes (OAuth, gateway)
need them on each request; not propagating headers will silently break those
providers even after the method-name fix.

### Trace 3 — packaging (`package.json` + imports, source issue #028)

Symptom: fresh `npm install` cannot resolve peer dependencies; `npm pack`
contains stale references.

```
downstream user runs `pi install npm:@coctostan/pi-exa-gh-web-tools`
↓
npm reads package.json:
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
↓
npm tries to resolve "@mariozechner/pi-coding-agent" against the host project
host project (fresh pi) has installed "@earendil-works/pi-coding-agent@^0.74"
  → no overlap → peer dep mismatch warning / install fails on `pnpm`/strict
↓
even if the install completes (`*` is permissive), TypeScript build still
imports from "@mariozechner/pi-coding-agent", which resolves to the LEGACY
scope frozen at 0.73.1.
  - 0.73.1 still has `getApiKey` and the old session events
  - so the build "works" in isolation
  - but downstream users on fresh pi will end up with TWO copies of the
    coding-agent types in node_modules under different scopes, and runtime
    extension dispatch (which uses the @earendil-works ExtensionAPI) won't
    deliver events to handlers typed against the @mariozechner ExtensionAPI
```

The `@sinclair/typebox` peer also needs review: pi 0.74 declares pi-ai depends
on `typebox` (unscoped) — `dependencies: typebox: ^1.1.24` per `pi-ai@0.74.0`'s
package metadata — so `@sinclair/typebox` may also be the wrong identifier.
**Flagging for the plan**; not the principal failure.

### Trace 4 — README docs (#029)

Symptom: dead links and stale install commands.

`README.md:3` links `github.com/nicholasgasior/pi-coding-agent`; that org/repo
is not the pi home. Current homes per `npm view`:

- `@earendil-works/pi-coding-agent` → `https://github.com/earendil-works/pi-mono#readme`
- `@earendil-works/pi-ai` → `https://github.com/earendil-works/pi-mono#readme`

`README.md:35,42` advertise `pi install npm:…` and `pi install github:…` but
neither command is anchored to a minimum pi version, and the README never
mentions that fresh pi (`0.74.x`) ships the `@earendil-works` peer scope.

### Trace 5 — vendored dev snapshot (#030)

`.pi/npm/node_modules/@mariozechner/pi-coding-agent/package.json` →
`"version": "0.73.0"` (one minor behind upstream + legacy scope). This is the
ABI that local `pi -e ./index.ts` runs against, so a developer "smoke test"
with that snapshot will keep passing even after the source switches to the
new scope — until the snapshot is regenerated.

## Affected Code

| Issue | File | Lines | Symbol |
|------|------|-------|--------|
| #026 | `index.ts` | 1 | `import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent"` |
| #026 | `index.ts` | 135–137 | `pi.on("session_start", ...)` — needs `reason` inspection |
| #026 | `index.ts` | 139–149 | `pi.on("session_switch"|"session_fork"|"session_tree", ...)` — remove or migrate |
| #026 | `index.ts` | 53–59 | `handleSessionStart(ctx)` — split: full reset for new/resume/fork/startup, no-op (or restoreFromSession only) for reload |
| #026 | `index.ts` | 151–153 | `pi.on("session_shutdown", ...)` — stays |
| #026 | `index.test.ts` | (lifecycle suite) | re-exercise `session_start` with each `reason` |
| #027 | `filter.ts` | 1 | `import type { ModelRegistry } from "@mariozechner/pi-coding-agent"` |
| #027 | `filter.ts` | 6–8 | `FilterModelResult` union — add `headers?: Record<string,string>` to ok branch |
| #027 | `filter.ts` | 31–62 | `resolveFilterModel` — switch to `getApiKeyAndHeaders`, handle `{ok:true, apiKey, headers}` and `{ok:false, error}` paths |
| #027 | `filter.ts` | 64–102 | `filterContent` — thread `headers` into `completeFn(model, context, { apiKey, headers })` |
| #027 | `filter.test.ts` | — | cover `ok:true`, `ok:true+headers`, `ok:false` |
| #028 | `package.json` | 55–59 | flip `peerDependencies` to `@earendil-works/pi-coding-agent ^0.74.0`, `@earendil-works/pi-tui ^0.74.0`; verify `@sinclair/typebox` vs `typebox` |
| #028 | `package.json` | 3 | bump `version` to `4.0.0` (breaking change per #028 acceptance) |
| #028 | `index.ts` | 1, 2, 4 | flip imports to `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai` |
| #028 | `filter.ts` | 1–2 | same |
| #029 | `README.md` | 3 | replace `nicholasgasior/pi-coding-agent` → `earendil-works/pi-mono` (or `earendil-works/pi` umbrella) |
| #029 | `README.md` | 35, 42 | confirm `pi install` syntax; add "requires pi 0.74+" note |
| #029 | `README.md` | (Configuration / Development sections) | call out `@earendil-works/*` peer scope; document `.pi/npm` refresh command |
| #029 | `README.md` | "Changelog" | add `4.0.0` entry |
| #030 | `.pi/npm/node_modules/**` | — | regenerate against `@earendil-works/*@^0.74` |
| #030 | `.pi/npm/package-lock.json` | — | regenerated, committed |
| #030 | `.pi/npm/package.json` | — | currently only declares `pi-hooks` + `pi-provider-kimi-code`; add the `@earendil-works/pi-coding-agent` + `@earendil-works/pi-tui` dependencies explicitly so the snapshot is reproducible |
| #030 | `README.md` (Development) | — | document `cd .pi/npm && npm install` (or `pi package install`) flow |

## Pattern Analysis

### Working code in this repo we can mirror

- **`pi.on("session_start", ...)` already exists at `index.ts:135`** — the
  registration shape and `ExtensionContext` plumbing through to
  `handleSessionStart` is correct; what's missing is `event.reason` inspection.
  The fix is additive: keep the registration, add a `reason` branch.
- **`pi.on("session_shutdown", ...)` at `index.ts:151`** is a one-arg handler
  that already follows the 0.74 contract. It is the correctness template the
  new `session_start` reason-aware handler should mirror.
- **`ResolvedRequestAuth` discriminated unions** are already idiomatic in this
  codebase — see `FilterModelResult` (`filter.ts:6–8`) and `FilterResult`
  (`filter.ts:17–19`). The 0.74 API returns the same shape, so the migration
  is "drop one layer of bookkeeping" rather than "rebuild the type model".

### Differences between broken and working

| Broken | Working analogue | Delta |
|---|---|---|
| `pi.on("session_switch"\|"session_fork"\|"session_tree", h)` | `pi.on("session_start", h)` already at index.ts:135 | the broken calls registered for *gone* event names; the working call only needs `reason` inspection |
| `registry.getApiKey(model): Promise<string \| undefined>` | `registry.getApiKeyAndHeaders(model): Promise<ResolvedRequestAuth>` | result wraps `apiKey` in a discriminated union plus optional `headers` |
| `completeFn(model, ctx, { apiKey })` | `completeFn(model, ctx, { apiKey, headers })` | adds the headers channel for OAuth/gateway providers |
| `from "@mariozechner/*"` | `from "@earendil-works/*"` | string-only change, but must be done in all three packages (pi-coding-agent, pi-tui, pi-ai) |

### Assumptions violated

The old code assumes:

1. The extension API emits separate `session_switch`/`session_fork` events — it
   doesn't anymore; everything funnels through `session_start` with a `reason`.
2. `ModelRegistry.getApiKey` is a thing — it's been replaced.
3. Filter-model auth is just an API key — providers like Anthropic OAuth need a
   header too; the new `ResolvedRequestAuth.headers` makes that explicit.
4. The `@mariozechner` npm scope is the canonical pi home — it was migrated.
5. `clearUrlCache()` / `cleanupTempFiles()` are safe on every session
   transition — they are, but they're wasteful on `reason: "reload"` (which
   per the upstream contract is "we just reloaded the same session in place").

## Risk Assessment

### Dependents of the affected code

- `handleSessionStart` / `handleSessionShutdown` (`index.ts:53,61`) are the
  only consumers of the session events. They reset the URL cache, clone cache,
  pending fetches, temp files, and result storage. Behavior change on
  `reason === "reload"` is **observable** to users: it preserves the URL cache
  and offload temp files across in-place reloads. Tests in `index.test.ts`
  currently assert "clearUrlCache called on `session_start`" without
  distinguishing reasons — they must be split per reason.
- `filterContent` is called from `index.ts` (search call sites for
  `filterContent(`). Its contract — `{ filtered, model }` or
  `{ filtered: null, reason }` — does not change. Threading `headers` is
  internal. So the blast radius on consumers is **zero** unless the test
  doubles for `complete` need updating.
- `getApiKeyAndHeaders` is the only ModelRegistry method `filter.ts` uses.
  No other source file touches `ModelRegistry`.
- The `@mariozechner` → `@earendil-works` flip affects every `.ts` file with
  one of those imports (`index.ts`, `filter.ts`). Source-file blast radius is
  fully captured by `grep -nR '@mariozechner' --include='*.ts'`.

### What could break

- **Downstream users still on pi < 0.74**: package.json #028 acceptance is
  explicit that we will not ship a shim — we bump to `4.0.0` and rely on
  semver. Anyone pinned to old pi must stay on `pi-web-tools@3.x`.
- **`@mariozechner/pi-ai`**: the issue text in #028 says "pi-ai may remain
  under its current package — verify". Verified during diagnose:
  `@earendil-works/pi-ai@0.74.0` exists and re-exports `complete`, `Model`,
  `Api`, `Context`, `AssistantMessage`, `ProviderStreamOptions`. The new
  scope is the right target.
- **`@sinclair/typebox` peer**: 0.74 pi-ai depends on the bare `typebox`
  package (`typebox: ^1.1.24`), not `@sinclair/typebox`. Need to verify
  whether the `Type` re-export from `pi-ai` matches typebox's shape — if so,
  the `@sinclair/typebox` peer is stale and may need to be removed or replaced
  with `typebox: ^1.1.0`. Flag for plan.
- **Local `npm test` will break temporarily** during implementation if peer
  deps are flipped before the source compiles against the new scope, because
  `node_modules/@earendil-works/*` isn't installed yet. The implementation
  order matters: plan should sequence
  (i) install new peers locally,
  (ii) flip imports + API calls,
  (iii) update tests,
  (iv) regenerate vendored snapshot.
- **Vendored `.pi/npm` snapshot** ships in git. After #030, `.pi/npm/node_modules`
  contents change shape (different scope dir). Reviewers should expect a
  large `git diff` in `.pi/npm/`.

### Related bugs sharing this root cause

All five issues (#026–#030) share the **single root cause** "the repo never
adopted the v0.63 + v0.65 + v0.74 pi breaking changes". They are five distinct
files to touch but a single coordinated migration. Any partial fix (e.g. just
#026) leaves a half-migrated tree that won't compile against the package
manifest, which is exactly why the upstream `pi -e ./index.ts` works today
(stale snapshot) but `npm install + tsc` against a fresh tree will not.

## Fixed When

1. **#026 (events)** — `pi.on("session_switch"|"session_fork"|"session_tree", …)` is
   removed from `index.ts`. The remaining `pi.on("session_start", …)` inspects
   `event.reason` and only triggers the full reset (`abortAllPending`,
   `clearCloneCache`, `clearUrlCache`, `cleanupTempFiles`, `restoreFromSession`)
   for `reason ∈ {startup, new, resume, fork}`; on `reason === "reload"` it
   does not blow away URL cache or temp files (only re-runs
   `restoreFromSession`, if at all). `index.test.ts` exercises all five
   reasons explicitly.
2. **#027 (model auth)** — `filter.ts` uses `getApiKeyAndHeaders`. The
   `FilterModelResult` ok-branch carries optional `headers`. `filterContent`
   passes `{ apiKey, headers }` to `completeFn`. `filter.test.ts` covers
   `{ok:true, apiKey}`, `{ok:true, apiKey, headers}`, and `{ok:false, error}`
   paths.
3. **#028 (scope)** — `package.json#peerDependencies` lists
   `@earendil-works/pi-coding-agent ^0.74.0` and `@earendil-works/pi-tui
   ^0.74.0`. The `@sinclair/typebox` peer is either retained (verified
   compatible with `pi-ai`'s `Type` re-export) or replaced with bare `typebox`.
   Every `.ts` source file imports from `@earendil-works/*` (no
   `@mariozechner/*` references left outside this issue's diagnosis artifacts).
   Major version bumped to `4.0.0`. `npm pack --dry-run` shows no
   `@mariozechner` strings.
4. **#029 (README)** — `nicholasgasior/pi-coding-agent` link replaced with
   `earendil-works/pi-mono`. `pi install` commands re-verified or annotated
   with a "requires pi 0.74+" note. Peer-dependency scope is called out in a
   Quick Start or Requirements section. A new `4.0.0` changelog entry exists.
   Development section documents how to refresh the vendored snapshot.
5. **#030 (snapshot)** — `.pi/npm/node_modules/@earendil-works/pi-coding-agent`
   and `@earendil-works/pi-tui` exist at `^0.74`. `.pi/npm/package.json`
   explicitly lists them. `.pi/npm/package-lock.json` is regenerated and
   committed. Legacy `.pi/npm/node_modules/@mariozechner/*` is removed.
   `pi -e ./index.ts` against the refreshed snapshot still registers all four
   tools (smoke test in the verify phase).
6. **End-to-end** — `npm install && npm run build && npm test` is green
   against the fresh `@earendil-works/*@^0.74` peers (currently the project's
   own `node_modules` has the legacy 0.52.9 snapshot and tests pass for the
   wrong reason — see Reproduction "Local tests deceptively green").
   `tsc -p tsconfig.json` emits zero errors and the `npm test` count of 258
   stays green or grows (new tests are additive).
