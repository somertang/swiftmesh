# Changelog

All notable changes to SwiftMesh are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Reduce mesh:** Viewport tool to weld and decimate static meshes with a keep-ratio slider, live triangle/vertex counts, and GLB export. Skinned and morph-target meshes are skipped. Closing the panel restores the original geometry.

### Fixed

- **Reduce mesh export:** Strip runtime `userData` (`__shadingData`, hierarchy ids) before writing GLB so reopening a reduced file keeps a live material and the mesh stays visible.
- **Reduce mesh ratio:** Auto-solve meshoptimizer error from the keep-ratio slider so aggressive targets (e.g. 50%) actually reach the requested triangle count instead of stopping at the old fixed 0.02 cap.
- **Reduce mesh export feedback:** Show a file-saved toast with truncated path, hover for full path, and an Open file action; keep export results out of the reduce panel.
- **Reduce mesh panel:** Restyle Lock UV borders as a settings row with a full-size switch, and show an inline progress bar while exporting.
- **Reduce mesh toolbar:** Use compress for Reduce mesh (shipped in the offline Material Symbols pack so the glyph renders).

### Unchanged

- **CI releases:** GitHub Actions still builds Windows and macOS on version tags; after both jobs finish, release notes are synced from CHANGELOG onto the GitHub Release.

## [0.3.1] - 2026-08-18

### Added

- **Lighting mode:** Add a new **Rendered** mode that uses embedded model lights, matching Blender-style rendered previews.

### Changed

- **FBX/OBJ material display:** Convert non-PBR Lambert/Phong display materials to PBR for viewport rendering so studio IBL and exposure behave consistently.
- **Scene lighting behavior:** Keep model-authored cameras hidden in display clones; initialize embedded lights off and enable them only in Rendered mode.
- **Lighting UI:** Keep material display modes (wireframe/solid/material) separate from lighting modes, and include Rendered as a first-class lighting option.

### Unchanged

- **CI releases:** GitHub Actions still builds Windows and macOS on version tags; after both jobs finish, release notes are synced from CHANGELOG onto the GitHub Release.

## [0.3.0] - 2026-08-14

### Added

- **FBX:** Open local `.fbx` files with texture handling, plus animation clip selection and a playback bar for FBX clips.

### Changed

- **Viewport HUD:** Replace the bottom status bar with a viewport info HUD that shows camera projection, view zoom, and unit scale.
- **Documentation:** Align README, the User Guide, and the product page with current inspect and capture tools, and refresh the demo shots.

### Unchanged

- **CI releases:** GitHub Actions still builds Windows and macOS on version tags; after both jobs finish, release notes are synced from CHANGELOG onto the GitHub Release.

## [0.2.15] - 2026-08-13

### Added

- **Viewport camera:** Add a perspective / orthographic toggle, with Fit, zoom, and the NavGizmo working in both projections.
- **Inspect tools:** Add surface annotate and two-point measure on the left toolbar. Hits work on the model, ground plane, or view plane, and overlay lines are not occluded by the mesh.
- **Recording projection:** Add a capture projection option (follow viewport, perspective, or orthographic) used as the default for new recordings.

### Changed

- **Recording prefs:** Recording settings in Preferences apply to all tabs except the per-tab video / images mode; jobs already in progress keep the snapshot from when they started.
- **Image export:** Multi-axis stills ask for one output folder and filename prefix before capture instead of prompting once per axis.
- **Preferences:** Edits stay in a draft until Save; Discard reverts. Language and UI / model themes preview live and restore if the dialog is closed without saving. Reset to defaults uses an in-app confirm, then writes immediately (language is kept).
- **Hierarchy:** Enlarge the filled caret expand controls so they match nearby tree icons.
- **Viewport grid:** Thin the red / green world axes so they sit closer to the grey grid.
- **Empty state:** Enlarge the New tab logo so it balances the SwiftMesh title; the titlebar logo is unchanged.

### Unchanged

- **CI releases:** GitHub Actions still builds Windows and macOS on version tags; after both jobs finish, release notes are synced from CHANGELOG onto the GitHub Release.

## [0.2.14] - 2026-08-13

### Changed

- **UI chrome:** Restyle the titlebar, tabs, toolbars, and inspect panels with Minimal-inspired tokens — Public Sans, shared translucent float chrome, and MUI theme overrides — while keeping SwiftMesh orange as the primary accent.
- **Theming:** Apply the new chrome language across swiftmesh / dark / business / night so viewport overlays and panels share the same surface treatment.
- **Recording:** Replace the bottom recording popover with circular FABs (video vs stills) plus a mode-toggle control; recording parameters stay in Preferences, where recording mode is a dropdown.
- **Inspect panels:** Compact hierarchy / textures / materials / geometries search fields, and align the Geometries Meshes column header with cell content.

### Fixed

- **Titlebar:** Keep the Open Recent hover submenu open when moving the pointer into the flyout.

### Unchanged

- **CI releases:** GitHub Actions still builds Windows and macOS on version tags; after both jobs finish, release notes are synced from CHANGELOG onto the GitHub Release.

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
