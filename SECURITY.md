# Security policy

ATLAS combines a browser, local profile storage, external agent providers, native downloads, and optional microphone access. Security reports are taken seriously.

## Supported versions

| Version | Security updates |
| --- | --- |
| `0.1.x` | Supported |
| Earlier snapshots | Not supported |

## Reporting a vulnerability

Do not open a public issue for vulnerabilities, credentials, authentication material, or private project data.

Use [GitHub private vulnerability reporting](https://github.com/SketchOTP/ATLAS-Browser/security/advisories/new). Include:

- A concise description and affected version
- Reproduction steps using synthetic data
- The impacted profile, project, browser, provider, or filesystem boundary
- Expected and observed behavior
- Any proposed mitigation

Do not include real OAuth tokens, API keys, cookies, private documents, or personal browsing history. Reports will be acknowledged as capacity allows, validated against a clean profile, and coordinated before public disclosure.

## Security model

- Website renderers are sandboxed and context-isolated.
- Website state is partitioned by ATLAS profile.
- Browser views are keyed by profile, project, and tab.
- Agent mutations are checked against the selected scope.
- Linked downloads authorize one exact Library resource rather than a directory.
- OpenAI-compatible API keys are encrypted with Electron `safeStorage`.
- CLI provider credentials remain under the provider CLI's control.

ATLAS is pre-1.0 software and has not completed an independent security audit. Privacy Shield reduces common tracking but does not provide anonymity, hide an IP address, or make account logins unlinkable.

The repository runs CodeQL analysis, full-history secret scanning, dependency review, production dependency auditing, package allowlist verification, and isolated packaged-application smoke tests in GitHub Actions. These controls reduce risk but do not replace independent review.
