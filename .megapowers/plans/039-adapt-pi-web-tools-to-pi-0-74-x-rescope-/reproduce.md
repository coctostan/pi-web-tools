# Reproduction: pi-web-tools is incompatible with @earendil-works/pi-* 0.74.x

This batch issue (#026–#030) is a forward-compatibility break: the code currently
compiles and tests pass **only against the locally-vendored legacy `@mariozechner`
0.73.0 snapshot**. Against the published `@earendil-works/*` 0.74.0 packages it
fails to type-check, the runtime contract has shifted, and the package's
`peerDependencies` and README point at packages/orgs that no longer exist on
fresh installs.

## Steps to Reproduce

### A. Type-incompatibility with @earendil-works 0.74.0

```bash
mkdir -p /tmp/pi-074-probe && cd /tmp/pi-074-probe
npm pack @earendil-works/pi-coding-agent@0.74.0
tar -xzf earendil-works-pi-coding-agent-0.74.0.tgz
cat > probe.ts <<'EOF'
import type { ExtensionAPI, ModelRegistry, Model, Api } from "./package/dist/index";

export default function (pi: ExtensionAPI) {
  pi.on("session_switch", async () => {});
  pi.on("session_fork",   async () => {});
}

export async function probeKey(r: ModelRegistry, m: Model<Api>) {
  return r.getApiKey(m);
}
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler",
  "target": "es2022", "strict": true, "noEmit": true, "skipLibCheck": true },
  "include": ["probe.ts"] }
EOF
tsc -p tsconfig.json
```

These four lines mirror what `index.ts` and `filter.ts` do today.

### B. Confirm the new event shape

```bash
grep -E "session_(start|switch|fork|tree)|reason|previousSessionFile" \
  /tmp/pi-074-probe/package/dist/core/extensions/types.d.ts
```

### C. Confirm getApiKey is gone

```bash
grep -E "getApiKey" /tmp/pi-074-probe/package/dist/core/model-registry.d.ts
```

### D. Confirm the npm scope move + repo problem

```bash
npm view @earendil-works/pi-coding-agent version   # 0.74.0
npm view @earendil-works/pi-tui          version   # 0.74.0
grep -nR '@mariozechner' --include='*.ts' --include='*.json' \
  . 2>/dev/null | grep -v node_modules | grep -v .pi/npm
grep -n 'nicholasgasior\|pi install' README.md
```

## Expected Behavior

- Against `@earendil-works/pi-coding-agent@^0.74` (the only thing currently on
  the registry under the maintained scope) the package should:
  - Type-check (`tsc -p tsconfig.json`).
  - Register only the documented lifecycle events: `session_start` (with a
    `reason` discriminator) and `session_shutdown`.
  - Resolve filter-model credentials through `ModelRegistry.getApiKeyAndHeaders`
    and thread `headers` through to `complete(...)`.
  - Declare `peerDependencies` on the `@earendil-works/*` scope.
- The README should point at live upstream repos (`earendil-works/pi`,
  `earendil-works/pi-mono`) and document install commands valid for pi `0.74.x`.
- `.pi/npm/node_modules/...` (the vendored dev snapshot) should match the
  packages we declare as peers, otherwise local `pi -e ./index.ts` runs use a
  different ABI than `npm install`-ed downstream users.

## Actual Behavior

### B-1. Code uses removed event overloads

`index.ts` lines 139–149 register handlers that are no longer in the API:

```
139:5fb|  pi.on("session_switch", async (_event, ctx) => {
143:0af|  pi.on("session_fork",   async (_event, ctx) => {
147:d3b|  pi.on("session_tree",   async (_event, ctx) => {
```

In `@earendil-works/pi-coding-agent@0.74.0` the only `on(...)` overloads for
session lifecycle are `session_start` and `session_shutdown`
(`package/dist/core/extensions/types.d.ts`):

```
on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
on(event: "session_tree", handler: ExtensionHandler<SessionTreeEvent>): void;
```

`session_start` has been widened with new fields:

```
type: "session_start";
reason: "startup" | "reload" | "new" | "resume" | "fork";
previousSessionFile?: string;
```

There is no `session_switch` / `session_fork` overload, so the current `pi.on`
calls produce TS2769 (see Evidence below). They are also no-ops at runtime,
meaning sessions started via `/new`, `/resume`, or `/fork` no longer trigger
the existing `handleSessionStart` (abort pending fetches, clear caches, clean
up temp files).

### B-2. `ModelRegistry.getApiKey` is gone

`filter.ts:42` and `filter.ts:55`:

```
42:67c|        const apiKey = await registry.getApiKey(model);
55:67c|    const apiKey = await registry.getApiKey(model);
```

In `0.74.0`, `package/dist/core/model-registry.d.ts` exposes:

```
getApiKeyAndHeaders(model: Model<Api>): Promise<ResolvedRequestAuth>;
getApiKeyForProvider(provider: string): Promise<string | undefined>;
```

`getApiKey` no longer exists, so on the live API the property access fails (TS
error at build time; `undefined is not a function` at runtime in JS).
`filterContent` would then short-circuit to `{ filtered: null, reason: ... }`
and the whole `fetch_content({prompt})` path silently falls back to raw
extraction.

### B-3. Package scope still points at deprecated `@mariozechner/*`

`package.json`:

```json
"peerDependencies": {
  "@mariozechner/pi-coding-agent": "*",
  "@mariozechner/pi-tui": "*",
  "@sinclair/typebox": "*"
}
```

Top-level `npm view`:

- `@mariozechner/pi-coding-agent` — last version published `0.73.1`; no
  `0.74.x`. Will be deprecated per pi changelog v0.74.0.
- `@earendil-works/pi-coding-agent@0.74.0` — current.
- `@earendil-works/pi-tui@0.74.0` — current.

All source imports still use the old scope (`grep -nR '@mariozechner'
--include='*.ts'` outside `node_modules`/`.pi/npm`):

```
filter.ts:1  import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
filter.ts:2  import type { Api, AssistantMessage, ... } from "@mariozechner/pi-ai";
index.ts:1   import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
index.ts:2   import { Text } from "@mariozechner/pi-tui";
index.ts:4   import { complete } from "@mariozechner/pi-ai";
```

(Note `@mariozechner/pi-ai` may legitimately keep its scope — to be verified
against the current `pi-mono` monorepo during diagnose, not here.)

### B-4. README references dead orgs / unverified install commands

`README.md`:

- L3 links `https://github.com/nicholasgasior/pi-coding-agent` — that org/repo
  is no longer the pi home (now `earendil-works/pi` umbrella and
  `earendil-works/pi-mono` for source).
- L35 / L42 advertise `pi install npm:@coctostan/pi-exa-gh-web-tools` and
  `pi install github:coctostan/pi-web-tools` without specifying a minimum pi
  version — `pi install` semantics changed across `0.6x → 0.74` and need
  re-verification.
- README never mentions that the peer-dependency scope has moved to
  `@earendil-works`, so fresh users see a peer-dep mismatch with no
  explanation.

### B-5. Vendored dev snapshot is stale + wrong scope

```
.pi/npm/node_modules/@mariozechner/pi-coding-agent/package.json
  -> "version": "0.73.0"
```

This is the snapshot local `pi -e ./index.ts` runs against. It is:
1. Under the legacy scope (will deprecate).
2. One minor behind upstream.
3. About to desync further once `peerDependencies` flip to `@earendil-works`.

## Evidence

### Exact TypeScript errors against @earendil-works/pi-coding-agent@0.74.0

Probe at `/tmp/pi-074-probe/probe.ts` (mirrors current code shape), compiled
with `tsc 5.7` + `strict: true`:

```
probe.ts(1,44): error TS2305: Module '"./package/dist/index"' has no exported member 'Model'.
probe.ts(1,51): error TS2305: Module '"./package/dist/index"' has no exported member 'Api'.
probe.ts(4,9):  error TS2769: No overload matches this call.
    The last overload gave the following error.
      Argument of type '"session_switch"' is not assignable to parameter of type '"input"'.
probe.ts(5,9):  error TS2769: No overload matches this call.
    The last overload gave the following error.
      Argument of type '"session_fork"' is not assignable to parameter of type '"input"'.
probe.ts(9,12): error TS2339: Property 'getApiKey' does not exist on type 'ModelRegistry'.
```

(TS2305 on `Model`/`Api` indicates `@earendil-works/pi-ai` is now the canonical
re-export; that's an additional rescope detail for the diagnose phase.)

### Type-definition deltas (`@earendil-works/pi-coding-agent@0.74.0`)

`package/dist/core/extensions/types.d.ts`:

```
type: "session_start";
reason: "startup" | "reload" | "new" | "resume" | "fork";
previousSessionFile?: string;
type: "session_shutdown";
reason: "quit" | "reload" | "new" | "resume" | "fork";
type: "session_tree";
on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
on(event: "session_tree", handler: ExtensionHandler<SessionTreeEvent>): void;
```

`package/dist/core/model-registry.d.ts`:

```
getApiKeyAndHeaders(model: Model<Api>): Promise<ResolvedRequestAuth>;
getApiKeyForProvider(provider: string): Promise<string | undefined>;
```

### Local tests deceptively green

`npm test` currently reports `258 passed (258)` because resolution still pulls
the locally-installed `@mariozechner/pi-coding-agent@0.52.9` from the project's
own `node_modules` (which still has `getApiKey` and `session_switch/fork/tree`
overloads). That snapshot does **not** reflect what an end user installing
`@earendil-works/pi-coding-agent@^0.74` will see, so green tests here do not
contradict the reproduction above.

```
node_modules/@mariozechner/pi-coding-agent/package.json -> "version": "0.52.9"
.pi/npm/node_modules/@mariozechner/pi-coding-agent/package.json -> "version": "0.73.0"
npm view @mariozechner/pi-coding-agent versions # last is 0.73.1, no 0.74.x
npm view @earendil-works/pi-coding-agent version # 0.74.0
```

## Environment

- pi-web-tools: 3.0.0 (HEAD)
- Local resolution: `@mariozechner/pi-coding-agent@0.52.9` (root `node_modules`),
  `@mariozechner/pi-coding-agent@0.73.0` (vendored `.pi/npm`).
- Probe target: `@earendil-works/pi-coding-agent@0.74.0`,
  `@earendil-works/pi-tui@0.74.0`.
- TypeScript: 5.7.x, `strict: true`, `moduleResolution: bundler`.
- Node: v22 (host machine). macOS 14, arm64.

## Failing Test

Not feasible as a single in-repo unit test today because:

1. The breakage is in the **published peer dependency**, not in our source — the
   only way to make it surface inside `vitest` is to bump the installed package
   in `node_modules` to `@earendil-works/pi-coding-agent@0.74.0`, which is
   exactly the rescope work this batch is going to do.
2. Two of the failures are TypeScript-only (`pi.on("session_switch", …)` and
   `registry.getApiKey(...)`) — `vitest` doesn't type-check production sources
   in the current config; they'd show up as `npm run build` failures once peer
   deps are updated.

The repro shell script above (`/tmp/pi-074-probe`) acts as the failing
"integration test" until the diagnose/implement phases land per-issue
regressions:

- `index.test.ts` — new tests for `session_start` with each `reason` value
  (`startup`, `reload`, `new`, `resume`, `fork`) ensuring the `reload` reason
  does **not** clear caches/temp files (#026 acceptance).
- `filter.test.ts` — `getApiKeyAndHeaders` paths: `{ok:true, apiKey}`,
  `{ok:true, apiKey, headers}`, `{ok:false, error}` (#027 acceptance).
- `npm run build` after the peer-dep flip — must compile cleanly against
  `@earendil-works/pi-coding-agent@^0.74` (#028/#030 acceptance).

## Reproducibility

**Always**, given a fresh install resolved against the live npm registry:

- The TS2305/TS2769/TS2339 errors above are deterministic against
  `@earendil-works/pi-coding-agent@0.74.0`.
- The README dead-link and `peerDependencies` scope problems are static and
  user-visible regardless of runtime.
- Local `npm test` is **always green** today, but green only because of the
  stale `@mariozechner` snapshots — it does not refute the bug; it confirms
  the dev snapshot is out of sync (#030).
