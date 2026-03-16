# Issue 021 — README/package metadata/release prep

## Scope
- Fix stale GitHub URLs in `package.json`
- Rewrite `README.md` so Pi newcomers can understand installation, configuration, and tool usage quickly
- Prepare the package for the `2.0.0` npm release by documenting and verifying release-readiness steps

## Findings
- Git remote points to `coctostan/pi-web-tools`
- `package.json` still points to `coctostan/pi-exa-gh-web-tools` for repository/bugs/homepage
- `README.md` still references the old GitHub slug for the banner and GitHub install command
- npm registry latest is `1.1.0`, while local package version is `2.0.0`

## Constraints
- Keep package name as `@coctostan/pi-exa-gh-web-tools`
- Avoid unrelated dependency upgrades in this pass
- Only document commands that exist and were verified locally
