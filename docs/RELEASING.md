# Release process

ATLAS releases are produced from signed-off commits on `main` and published by the tag workflow.

## Prepare

1. Update `CHANGELOG.md` and `package.json` with the same semantic version.
2. Install exactly from the lockfile with `pnpm install --frozen-lockfile`.
3. Run `pnpm run release:check`.
4. Build an unpacked application with `pnpm run package:dir`.
5. Run `pnpm run verify:package`.
6. Launch with a temporary `ATLAS_USER_DATA_DIR` and non-default `ATLAS_BROWSER_PORT`.
7. Confirm the staged diff contains no profile data, credentials, machine paths, generated artifacts, or private screenshots.

## Publish

```bash
git tag -a v0.1.0 -m "ATLAS v0.1.0"
git push origin main
git push origin v0.1.0
```

Maintainers with a configured signing key should use `git tag -s` instead of `git tag -a`.

The release workflow builds Linux AppImage and Debian packages plus Windows NSIS and portable executables, verifies package contents, generates SHA-256 checksums, and creates a GitHub release.

Unsigned preview builds must be labeled as such. Never claim platform certification, code signing, notarization, auto-update support, or an independent security audit unless current evidence exists.
