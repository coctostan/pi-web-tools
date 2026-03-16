# Verification — Issue 021

## Changes made
- Updated `package.json` repository URL to `https://github.com/coctostan/pi-web-tools`
- Updated `package.json` bugs URL to `https://github.com/coctostan/pi-web-tools/issues`
- Updated `package.json` homepage to `https://github.com/coctostan/pi-web-tools#readme`
- Rewrote `README.md` for Pi newcomers with a simpler quick-start flow, clearer tool explanations, and a maintainer release checklist
- Updated GitHub install instructions in `README.md` to `pi install github:coctostan/pi-web-tools`

## Verification

### Tests
```bash
npm test
```
Result: 15 test files passed, 206 tests passed.

### Package dry run
```bash
npm pack --dry-run
```
Result: succeeded. Tarball name `coctostan-pi-exa-gh-web-tools-2.0.0.tgz` with expected source files, `README.md`, `LICENSE`, and `package.json`.

### URL checks
Verified these return HTTP 200:
- `https://github.com/coctostan/pi-web-tools`
- `https://github.com/coctostan/pi-web-tools/issues`
- `https://github.com/coctostan/pi-web-tools#readme`

## Remaining release step
npm registry still reports latest version `1.1.0`, while the repo package version is `2.0.0`. The remaining maintainer action is:

```bash
npm publish --access public
```

## Notes
- I did not perform unrelated dependency upgrades in this pass.
- I did not publish to npm directly because publishing is a release action that usually requires maintainer credentials/intent confirmation.
