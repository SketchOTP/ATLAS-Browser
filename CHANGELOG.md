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

[Unreleased]: https://github.com/SketchOTP/ATLAS-Browser/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SketchOTP/ATLAS-Browser/releases/tag/v0.1.0
