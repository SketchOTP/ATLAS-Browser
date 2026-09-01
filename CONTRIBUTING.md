# Contributing to ATLAS

Thank you for helping improve ATLAS. Contributions should preserve the product's core boundary: browser and agent state belongs to a profile and project, and unrelated projects must not gain access to it.

## Development setup

Requirements:

- Node.js 22.12 or newer
- pnpm 11.19 or newer
- Git
- A supported agent CLI only when testing agent integration
- Python 3.11 and FFmpeg only when testing optional local voice features

```bash
git clone https://github.com/SketchOTP/ATLAS-Browser.git
cd ATLAS-Browser
pnpm install --frozen-lockfile
pnpm start
```

Use an isolated data directory during development so tests never touch a personal ATLAS profile:

```bash
ATLAS_USER_DATA_DIR="$(mktemp -d)" ATLAS_BROWSER_PORT=49174 pnpm start
```

## Before opening a pull request

```bash
pnpm run release:check
pnpm run package:dir
pnpm run verify:package
git diff --check
```

Your pull request should explain the user-facing change, its trust-boundary impact, and the verification performed. Add or update tests for behavior changes.

## Security and privacy requirements

- Never commit profiles, cookies, OAuth tokens, API keys, downloads, local models, logs, or screenshots containing private work.
- Keep provider credentials owned by the provider CLI or Electron `safeStorage`.
- Treat website content and saved resources as untrusted input.
- Revalidate profile, project, and tab identifiers at every privileged boundary.
- Do not add arbitrary filesystem enumeration or JavaScript-evaluation tools to the agent surface.
- Test changes against a temporary `ATLAS_USER_DATA_DIR`.

Report vulnerabilities through the private process in [SECURITY.md](SECURITY.md), not a public issue.

## Commit and review style

- Keep commits focused and use imperative summaries.
- Avoid unrelated formatting churn.
- Preserve existing user data through explicit migrations.
- State limitations directly; do not strengthen claims beyond observed evidence.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
