# Learnings — 039 pi 0.74.x rescope

- **Vendored snapshots can mask breaking ecosystem migrations.** The repo's
  `.pi/npm/node_modules/@mariozechner/pi-coding-agent@0.73.0` snapshot kept the
  full test suite green for months even though the upstream API had already
  moved on to v0.63/v0.65/v0.74 contracts. Future migrations should test
  against published peers (or at least pin the vendored snapshot to the same
  versions declared in `peerDependencies`), not whatever happens to be in
  `node_modules/`.

- **"Five issues, one root cause" → batch as a single migration.** The
  upstream tracker split this into #026–#030, but splitting the implementation
  produces a half-migrated tree that fails to compile against the package
  manifest. The plan correctly sequenced peers-install → API fixes → import
  flip → manifest flip → snapshot refresh as one coordinated change.

- **Structural casts beat brittle re-exported types.** `ResolvedRequestAuth`
  isn't exported with a stable public name across the legacy/new scopes, so
  `filter.ts` defines a local `RegistryWithAuthHeaders` type and structurally
  narrows on `auth.ok && auth.apiKey`. This kept the migration robust against
  whichever package the imports point at while Tasks 2 and 5 were executing
  out of order.

- **Discriminated-union event payloads need explicit reason inspection at
  the registration site.** Just upgrading the package and keeping the old
  `pi.on("session_start", handler)` would have silently regressed behavior
  on `reason === "reload"` (wiping URL cache + temp files on benign reloads).
  Test the `reload` branch explicitly — not just "session_start was called".

- **`@sinclair/typebox` vs `typebox` is a real footgun.** pi 0.74's `pi-ai`
  depends on bare `typebox`, not the `@sinclair/` re-publish. The plan caught
  this during diagnosis ("Flag for plan") and resolved it with a single
  import + peer change. Easy to miss if the diagnosis only looks at the three
  main `@mariozechner` packages.

- **Transitive legacy-scope baggage may persist.** `.pi/npm/package-lock.json`
  still resolves `@mariozechner/pi-coding-agent@0.73.1` as a transitive of
  `pi-provider-kimi-code@0.3.0`. The top-level declared deps are clean and
  `pi -e` resolves the new scope first, but the lockfile drift is worth
  noting in case downstream cleanup is needed when `pi-provider-kimi-code`
  itself migrates.

- **Codify smoke tests as scripts, not manual checklists.** Issue #030's
  acceptance criterion was a manual `pi -e ./index.ts` check. Turning it into
  `scripts/smoke-load-extension.mjs` made it cheap to run in `verify` and
  catches regressions on the lifecycle-events surface specifically (asserts
  `session_switch`/`fork`/`tree` are *absent*).
