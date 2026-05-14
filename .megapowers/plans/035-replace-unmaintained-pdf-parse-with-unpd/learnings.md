# Learnings — 035 replace pdf-parse with unpdf

- A "dependency identity" bug is real: when the defect is the package itself (unmaintained + init-time side effects), the trace ends at `package.json`, not at a code line. Diagnosis framing benefits from explicitly naming that.
- Preserving the user-visible error contract (`"Failed to extract text from PDF: …"`) across a library swap kept the existing `result.error.toContain("PDF")` assertion stable and avoided cascading test churn. Error-string shape is a public API in disguise.
- `vi.mock("unpdf", …)` was the right call over feeding hand-crafted PDF bytes: the previous test's minimal PDF (single uncompressed `Tj` op) is borderline for real pdf.js, and mocking the boundary keeps tests deterministic without weakening assertions about return shape.
- ESM-first, pure-function libraries (`unpdf`, `linkedom`, `@mozilla/readability`) compose more cleanly into this codebase than CJS-shimmed classes with destroy lifecycles. Removing the `try/finally` + `destroy()` simplified the PDF branch noticeably.
- Adding a regression test (`dependencies.test.ts`) that asserts the unwanted package is *absent* is cheap insurance — it makes any accidental reintroduction (via merge, `npm install --save`, or transitive bump) loud on CI.
- npm ls and `find node_modules/<pkg> -iname "*.pdf"` are surprisingly powerful evidence for "no init-time fixture reads" — concrete, fast, no need to instrument the loader.
- Order matters in the plan: add new dep → swap call sites + tests under TDD → remove old dep. Reversing #1 and #3 would have made the intermediate state un-buildable.
