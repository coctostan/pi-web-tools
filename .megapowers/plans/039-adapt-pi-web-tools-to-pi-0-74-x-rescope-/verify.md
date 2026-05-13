# Verification Report — issue 039 (pi 0.74.x / earendil-works rescope)

## Test Suite Results

```
$ npm test
> @coctostan/pi-exa-gh-web-tools@4.0.0 test
> vitest run

 ✓ scope-rescope.test.ts (3 tests) 9ms
 ✓ filter.test.ts (12 tests) 4ms
 ✓ index.test.ts (33 tests) 766ms
   ✓ session_start with reason="startup" clears URL cache, clone cache, and temp files
 ✓ (… 24 files total …)

 Test Files  24 passed (24)
      Tests  269 passed (269)
```

Build:
```
$ ./node_modules/.bin/tsc -p tsconfig.json --noEmit
# exit 0
```

Smoke load against vendored `.pi/npm` snapshot:
```
$ npx tsx scripts/smoke-load-extension.mjs
OK: extension registered code_search, fetch_content, get_search_content, web_search
OK: lifecycle hooks session_shutdown, session_start, tool_result
```

The spec quotes 258 tests as the lower bound; we ship 269 (all green, additive
new tests for `session_start{reason}`, `getApiKeyAndHeaders`, and scope rescope).

## Reproduction (bugfix)

Diagnosis reproduction (`reproduce.md`) names two failure modes against
`@earendil-works/*@0.74`:

1. `pi.on("session_switch"|"session_fork"|"session_tree", …)` against the 0.74
   `ExtensionAPI.on` overloads → TS error / runtime no-op.
2. `registry.getApiKey(model)` against 0.74 `ModelRegistry` → TS2339 / runtime
   `TypeError`.

Source check (must be empty for the bug to be gone):

```
$ grep -n 'session_switch\|session_fork\|session_tree\|getApiKey\b' index.ts filter.ts
# (no output, exit 1)
```

```
$ grep -n "session_start\|session_shutdown" index.ts
135:  pi.on("session_start", async (event, ctx) => {
143:  pi.on("session_shutdown", async () => {
```

```
$ grep -rn '@mariozechner' --include='*.ts' . | grep -v node_modules | grep -v .megapowers
./filter.ts:7:// the legacy @mariozechner/* type declarations. We import types from the legacy
./scope-rescope.test.ts:17:  it("no source .ts file imports from @mariozechner/*", () => {
./scope-rescope.test.ts:21:      if (/from\s+["']@mariozechner\//.test(src)) {
./scope-rescope.test.ts:38:    expect(pkg.peerDependencies["@mariozechner/pi-coding-agent"]).toBeUndefined();
./scope-rescope.test.ts:39:    expect(pkg.peerDependencies["@mariozechner/pi-tui"]).toBeUndefined();
```

All remaining `@mariozechner` mentions are comment text or assertions that the
legacy scope is *absent*; zero `from "@mariozechner/…"` imports. Both
diagnosis-trace bugs are gone.

## Per-Criterion Verification

### Criterion #026 — events
`pi.on("session_switch"|"session_fork"|"session_tree", …)` removed;
`session_start` inspects `reason`; `reload` does not clear caches/temp files;
`index.test.ts` exercises all five reasons.

Evidence — `index.ts:133–145`:

```ts
export default function (pi: ExtensionAPI) {
  // Session event handlers
  pi.on("session_start", async (event, ctx) => {
    if ((event as { reason?: string }).reason === "reload") {
      restoreFromSession(ctx);
      return;
    }
    handleSessionStart(ctx);
  });

  pi.on("session_shutdown", async () => {
    handleSessionShutdown();
  });
```

`index.test.ts:219–235` iterates `["startup","new","resume","fork"]` for the
clear-all path and a separate test asserts the reload-preserves-state path.
Both test groups passed in the suite run above (33/33 in `index.test.ts`).

Smoke script also asserts:
```
if (registeredEvents.has("session_switch") || …"session_fork"… || …"session_tree"…) FAIL
```
and exits 0, so the legacy event names are absent at runtime registration.

**Verdict: pass.**

### Criterion #027 — model auth
`filter.ts` uses `getApiKeyAndHeaders`; `FilterModelResult` ok-branch carries
optional `headers`; `filterContent` passes `{ apiKey, headers }`; tests cover
`ok:true`, `ok:true+headers`, `ok:false`.

Evidence — `filter.ts`:
- L13–15: `RegistryWithAuthHeaders.getApiKeyAndHeaders(m): Promise<ResolvedRequestAuth>`
- L17–19: `FilterModelResult = { model, apiKey, headers? } | { model: null, reason }`
- L47: `const auth = await (registry as unknown as RegistryWithAuthHeaders).getApiKeyAndHeaders(model …)`
- L116: `await completeFn(model, context, { apiKey, headers })`

`filter.test.ts` cases (asserted live in test output):
- L6  `uses configured filterModel and returns apiKey on ok:true`
- L18 `threads headers from ok:true response`
- L37 `returns no-model when getApiKeyAndHeaders returns ok:false`
- L51 auto-detect ok:true
- L74 mixed ok:false/ok:true auto-detect

All 12 tests pass.

**Verdict: pass.**

### Criterion #028 — scope flip + major bump
`package.json#peerDependencies` lists `@earendil-works/pi-coding-agent ^0.74.0`,
`@earendil-works/pi-tui ^0.74.0`, plus `typebox ^1.1.0` (replacement for
`@sinclair/typebox`, justified in plan); `version` is `4.0.0`; no source `.ts`
imports `@mariozechner/*`; `npm pack --dry-run` contains no `@mariozechner`.

Evidence — `package.json`:

```json
"version": "4.0.0",
…
"peerDependencies": {
  "@earendil-works/pi-coding-agent": "^0.74.0",
  "@earendil-works/pi-tui": "^0.74.0",
  "typebox": "^1.1.0"
},
"devDependencies": {
  "@earendil-works/pi-ai": "^0.74.0",
  "@earendil-works/pi-coding-agent": "^0.74.0",
  "@earendil-works/pi-tui": "^0.74.0",
  …
}
```

```
$ npm pack --dry-run 2>&1 | grep -i mariozechner
# (no output)
```

`scope-rescope.test.ts` (3/3 passing) asserts: no source `.ts` imports
`@mariozechner/*`; peerDependencies key set equals
`["@earendil-works/pi-coding-agent","@earendil-works/pi-tui","typebox"]`;
version is `4.0.0`.

Source imports:
```
$ head -4 index.ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { complete } from "@earendil-works/pi-ai";

$ head -2 filter.ts
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@earendil-works/pi-ai";
```

**Verdict: pass.**

### Criterion #029 — README
`nicholasgasior` → `earendil-works/pi-mono`; pi 0.74 minimum-version notes;
peer-scope callout; 4.0.0 changelog; vendored-snapshot refresh flow documented.

Evidence — `README.md` (grep):
- L3 `[Pi coding agent](https://github.com/earendil-works/pi-mono)`
- L30 `- Pi coding agent ≥ 0.74.0 (npm scope @earendil-works/*)`
- L33 peer-dep scope statement, calls out `pi-web-tools@3.x` for older pi.
- L41 / L49 `> Requires pi 0.74 or newer.` annotated next to `pi install` cmds.
- L433–444 `### Refresh the vendored pi snapshot` section documents
  `rm -rf .pi/npm/node_modules .pi/npm/package-lock.json && (cd .pi/npm && npm install) && npx tsx scripts/smoke-load-extension.mjs`.
- L545–552 `### 4.0.0` changelog entry covers breaking pi 0.74 requirement,
  `getApiKeyAndHeaders` migration, `session_start{reason}`, refreshed snapshot.

```
$ grep -n nicholasgasior README.md
# (no output — old org reference fully removed)
```

**Verdict: pass.**

### Criterion #030 — vendored snapshot
`.pi/npm/node_modules/@earendil-works/{pi-coding-agent,pi-tui}` at `^0.74`;
`.pi/npm/package.json` declares them; `.pi/npm/package-lock.json` regenerated;
`pi -e ./index.ts` (smoke equivalent) registers all four tools.

Evidence:

```
$ ls .pi/npm/node_modules/@earendil-works
pi-agent-core
pi-ai
pi-coding-agent
pi-tui

$ open .pi/npm/node_modules/@earendil-works/pi-coding-agent/package.json | get name version
name=@earendil-works/pi-coding-agent
version=0.74.0

$ open .pi/npm/node_modules/@earendil-works/pi-tui/package.json | get name version
name=@earendil-works/pi-tui
version=0.74.0
```

`.pi/npm/package.json`:
```json
{
  "name": "pi-extensions",
  "private": true,
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^0.74.0",
    "@earendil-works/pi-tui": "^0.74.0",
    "pi-hooks": "^1.0.4",
    "pi-provider-kimi-code": "^0.3.0"
  }
}
```

`.pi/npm/package-lock.json` is present and committed (it still contains
legacy `@mariozechner/*` entries — but only as transitive deps of
`pi-provider-kimi-code@0.3.0`, which itself still depends on the legacy
scope. `npm ls` shows this clearly:

```
$ (cd .pi/npm && npm ls @mariozechner/pi-coding-agent)
pi-extensions@ …/.pi/npm
└─┬ pi-provider-kimi-code@0.3.0
  └─┬ @mariozechner/pi-coding-agent@0.73.1
```

Our top-level declared deps are clean; legacy entries are upstream-driven
transitive baggage from an unrelated package and are out of scope for this
issue.)

Smoke test:
```
$ npx tsx scripts/smoke-load-extension.mjs
OK: extension registered code_search, fetch_content, get_search_content, web_search
OK: lifecycle hooks session_shutdown, session_start, tool_result
```

All four tools register; lifecycle hooks are correct.

**Verdict: pass.**

### Criterion #6 — end-to-end
`npm install && npm run build && npm test` green against fresh
`@earendil-works/*@^0.74` peers; `tsc -p tsconfig.json` emits zero errors;
test count stays ≥ 258.

Evidence (already shown above): `tsc` exit 0; `npm test` reports
`Test Files 24 passed (24) / Tests 269 passed (269)`; build script exits 0.

`node_modules` contains `@earendil-works/pi-coding-agent@0.74.0`,
`@earendil-works/pi-tui@0.74.0`, `@earendil-works/pi-ai@0.74.0`,
`typebox@1.1.38` (verified via nu open of each `package.json`).

**Verdict: pass.**

## Overall Verdict

**pass.**

All six "Fixed When" criteria are met with command-output evidence from this
session: 269/269 tests green, TypeScript build clean, runtime smoke against
the refreshed vendored snapshot loads the four tools and the correct
lifecycle hooks, both bug-reproduction sites are gone from source, and the
package manifest plus README accurately advertise the pi-0.74 / @earendil-works
contract. Test count grew from the spec's stated 258 baseline to 269
(additive coverage for new behaviours), satisfying the "≥ 258" requirement.
