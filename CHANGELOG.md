# Changelog

All notable changes to SwiftMesh are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.13] - 2026-08-12

### Fixed

- **macOS updates:** Replace unreliable in-app `electron-updater` install flow with GitHub Releases version checks and a manual DMG download prompt, since unsigned builds cannot update seamlessly.
- **macOS preferences:** Hide the auto-update toggle on macOS; users check for updates manually and open the release page from the update dialog.

### Unchanged

- **Windows:** Keeps the existing in-app check, download, and restart install flow.
