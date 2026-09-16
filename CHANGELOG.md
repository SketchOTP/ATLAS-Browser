# Changelog

All notable changes to ATLAS are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the structure of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned

- Signed and notarized installers
- Automatic updates
- Profile export, import, and encrypted backup
- Broader accessibility and platform certification

## [0.1.7] - 2026-09-15

### Fixed

- Prevent a website from repeatedly saving the same filename from one browser tab. Duplicate attempts are cancelled for ten minutes, before a new file path is created.

## [0.1.5] - 2026-09-10

### Added

- Add a profile-specific custom accent-color picker in Settings. It updates ATLAS highlights, buttons, glow effects, controls, and progress indicators without changing project or bookmark colors.
- Use a website favicon by default for new URL tabs. Existing emoji choices remain intact, and users can still override any tab with the searchable emoji picker.

## [0.1.4] - 2026-09-10

### Fixed

- Scroll only the project list when the sidebar fills up. The ATLAS title, project search, navigation buttons, and Agent Usage Remaining bar stay in place while project rows retain their full height.
- Keep project-list scrolling contained, with a thin neon-purple scrollbar and space around selected project highlights.

## [0.1.3] - 2026-09-10

### Fixed

- Recover a missing GNOME X11 window-frame helper that can leave ATLAS running with an invisible window. Recovery checks the current desktop and display, uses only the system-owned helper, and limits attempts to three per five minutes.
- Contain Codex App Server pipe and spawn failures so agent disconnections cannot crash the browser. Pending requests now fail cleanly, time out when necessary, and reconnect without interference from stale child-process events.

### Security

- Expand source and packaged-app audits to reject credential files, browser storage, agent caches, and database files. Packaged content is scanned for sensitive markers regardless of file size.
- Preserve clean-install defaults: no maintainer profiles, projects, history, sign-ins, or settings are included in release artifacts.

## [0.1.2] - 2026-09-01

### Security

- Remove the web-preview URL probe endpoint so the local shell server never makes requests to user-supplied destinations
- Generate persistent workspace identifiers with `crypto.randomUUID()` instead of non-cryptographic randomness

## [0.1.1] - 2026-09-01

### Fixed

- Publish the Windows installer and portable build under distinct filenames so both artifacts are retained in GitHub Releases
- Disable electron-builder's implicit tag publishing so the audited release workflow is the only artifact publisher
- Use platform-native temporary directories during packaged-app verification on Windows

## [0.1.0] - 2026-09-01

### Added

- Project-scoped browser tabs, bookmarks, tasks, notes, resources, downloads, and agent conversations
- Resizable project sidebar and persistent project-scoped agent tray
- Configurable Codex, Claude Code, Antigravity, Cursor Agent, OpenClaw, Hermes, custom CLI, and OpenAI-compatible provider adapters
- Scoped agent tools for reading and controlling browser tabs, tasks, notes, and Library resources
- Local Whisper transcription and Kokoro speech generation options
- Per-profile website sessions, Privacy Shield controls, camera and microphone settings, and interactive onboarding
- Project calendar with task synchronization and reminder notifications
- Linux AppImage and Debian packaging plus Windows NSIS and portable packaging
- Automated tests, release audits, package-content verification, and tag-driven GitHub releases

### Security

- Renderer context isolation and sandboxing
- Profile, project, and tab browser-context isolation
- Project-capability checks for linked download access
- Encrypted storage for OpenAI-compatible API keys through Electron `safeStorage`
- Strict release allowlist that excludes local profiles, credentials, cookies, downloads, logs, and generated runtime state

[Unreleased]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.6...v0.1.7
[0.1.5]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/SketchOTP/ATLAS-Browser/releases/tag/v0.1.0
