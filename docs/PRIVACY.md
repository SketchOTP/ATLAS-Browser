# Privacy and data handling

ATLAS is local-first, not offline and not anonymous. This document describes the default behavior of version 0.1.x.

## What stays local

- Profile names, project metadata, tabs, bookmarks, tasks, notes, calendar events, and saved conversations
- Uploaded PDF and image blobs
- Privacy Shield and website media preferences
- Encrypted OpenAI-compatible API keys
- Temporary local speech recordings, which are removed after transcription

## What leaves the device

- Website requests go to the websites opened by the user or agent.
- Agent prompts and the context allowed by the selected scope go to the configured provider.
- Optional local voice dependencies may download model assets from their upstream projects during setup or first use.
- Provider CLIs may communicate with their own services according to their terms and configuration.

## Profiles and authentication

ATLAS website cookies and site storage are partitioned by profile. Projects inside one profile can reuse that profile's website authentication; another profile receives a different persistent session partition. Agent provider credentials are not copied between profiles by ATLAS.

## Privacy Shield

Balanced and Strict modes block known tracker hosts, remove common marketing parameters, and reduce selected request headers. Strict mode can break websites or trigger additional login verification. Privacy Shield cannot hide the public IP address, prevent a signed-in service from identifying its account, or eliminate browser fingerprinting.

## Downloads

Downloaded files remain in the operating system Downloads directory. A project Library entry links to one exact file. Removing the Library entry does not delete the file, and clearing a download notification does not remove either the file or its Library link.

## Removing local data

ATLAS data is stored in the Electron user-data directory:

- Linux: `~/.config/atlas-browser`
- Windows: `%APPDATA%\\atlas-browser`
- macOS: `~/Library/Application Support/atlas-browser`

Back up required information before removing that directory. Deleting it removes profiles, projects, website sessions, settings, and encrypted ATLAS secrets for that installation.
