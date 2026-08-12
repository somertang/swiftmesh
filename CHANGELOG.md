# Changelog

All notable changes to SwiftMesh are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.13] - 2026-08-12

### Fixed

- **macOS updates:** Replace unreliable in-app `electron-updater` install flow with GitHub Releases version checks and a manual DMG download prompt, since unsigned builds cannot update seamlessly.
- **macOS preferences:** Hide the auto-update toggle; users check for updates manually and open the release page from the update dialog.

### Unchanged

- **Windows:** Keeps the existing in-app check, download, and restart install flow.

## [0.2.12] - 2026-08-12

### Added

- **Recording:** Add turntable frame sequence and texture atlas export, including multi-axis capture for batch asset pipelines.

## [0.2.11] - 2026-08-06

### Fixed

- **Recording export:** Use near-lossless MP4 encoding for `maxCompatible` quality so exports retain more detail at the same compatibility target.
- **macOS menus:** Fix invalid nested list markup in the Open Recent submenu so menu rendering stays reliable across macOS versions.

## [0.2.10] - 2026-08-05

### Fixed

- **Viewer:** Auto-normalize centimeter and millimeter model units against the floor grid so imported assets appear at a sensible scale without manual adjustment.

## [0.2.9] - 2026-08-04

### Fixed

- **Recording:** Polish recording settings layout and default export filenames so saved outputs are easier to identify in Finder or Explorer.

## [0.2.8] - 2026-08-04

### Fixed

- **Windows updates:** Pin Windows installer artifact names to a space-free pattern so `electron-updater` can resolve `latest.yml` and download updates reliably.

### Unchanged

- **macOS packaging:** Release artifacts and manual install flow are unaffected by this Windows-only updater fix.

## [0.2.7] - 2026-08-04

### Changed

- **Website:** Add OS-aware download links and dual-platform landing copy on GitHub Pages so visitors reach the right Windows or macOS build faster.

### Fixed

- **Preferences:** Use semantic outline icons in the Preferences navigation sidebar for clearer section recognition.

## [0.2.6] - 2026-08-04

### Changed

- **Updates:** Improve desktop update feedback with clearer status messaging and unified top-of-app toast notifications when checks succeed or fail.
- **Documentation:** Clarify the macOS Gatekeeper “damaged app” workaround for unsigned downloads so first-time installs are less confusing.

### Fixed

- **CI releases:** Disable `electron-builder` publish during local `dist` scripts (`--publish never`) so packaging no longer requires `GH_TOKEN`; release uploads remain handled by GitHub Actions.
- **macOS UI:** Move primary menus to the system menu bar so window traffic lights no longer overlap in-app controls.
- **Recording:** Preserve camera framing after recording stops and refine export progress feedback during encode.

## [0.2.5] - 2026-08-03

### Changed

- **CI releases:** Add macOS dual-arch (`arm64` + `x64`) packaging and GitHub Actions jobs that build Windows and macOS artifacts on each version tag.

### Unchanged

- **In-app behavior:** No desktop UI or viewer changes in this release; this version focuses on release infrastructure.

## [0.2.4] - 2026-08-03

### Fixed

- **Updates:** Render sanitized HTML and Markdown release notes inside the update dialog so GitHub Release bodies display safely and readably before download.

## [0.2.3] - 2026-08-03

### Added

- **Website:** Publish a GitHub Pages product landing page with screenshots and model-theme previews for sharing SwiftMesh outside the desktop app.

### Changed

- **Help:** Open the User Guide from GitHub Pages instead of bundled local HTML so help content can be updated without shipping a new app build.

### Unchanged

- **Desktop packaging:** Existing installs can still use the app offline; only the Help entry point now prefers the online guide.

## [0.2.2] - 2026-08-03

### Added

- **Updates:** Show a confirmation dialog with release notes before downloading an update so users can review changes first.
- **Startup:** Add a launch splash and dark window background to reduce visual flash while the Electron shell initializes.

### Fixed

- **UI chrome:** Make title bar and tab menu dividers visible in dark themes.
- **Help:** Bundle the User Guide via `extraResources` so packaged builds include offline help files when needed.

## [0.2.1] - 2026-08-03

### Added

- **Help:** Add a local HTML User Guide under the Help menu for in-app documentation.

### Changed

- **Documentation:** Rewrite the README and standardize the author name as Somer Tang.

## [0.2.0] - 2026-08-03

### Added

- **Preferences:** Expand settings with session, performance, and About sections for deeper desktop customization.
- **Updates:** Add GitHub Releases auto-update plumbing for packaged builds.

### Changed

- **UI:** Migrate the desktop interface from daisyUI to MUI for a more consistent Material Design experience across dialogs, preferences, and controls.

## [0.1.0] - 2026-07-29

### Added

- **Desktop app:** Initial release of SwiftMesh — open local `.glb`, `.gltf`, and `.obj` files, inspect models in 3D, and record turntable animations.
