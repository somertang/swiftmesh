# SwiftMesh

Desktop app for viewing local 3D models, inspecting scene data, and recording a one-revolution turntable video.

**Formats:** `.glb` / `.gltf` / `.obj`  
**Platforms:** Windows x64 · macOS (Apple Silicon + Intel)  
**Stack:** Electron · React · Three.js · Vite · Material UI  
**License:** [MIT](./LICENSE)

---

## For users

### Download

Product page: **[somertang.github.io/swiftmesh](https://somertang.github.io/swiftmesh/)**

Install the latest build from:

**[Releases](https://github.com/somertang/swiftmesh/releases)**

| Platform | Asset | Notes |
| --- | --- | --- |
| Windows | `SwiftMesh Setup x.y.z.exe` | NSIS installer; **in-app auto-update targets this** |
| Windows | portable `.exe` | Optional; may appear in some releases |
| macOS Apple Silicon | `SwiftMesh-x.y.z-arm64.dmg` | Prefer this on M1/M2/M3/M4 |
| macOS Intel | `SwiftMesh-x.y.z-x64.dmg` | Intel Macs |

#### macOS: “SwiftMesh.app is damaged and can’t be opened”

macOS builds are **not code-signed or notarized**. After a browser download, Gatekeeper attaches a quarantine flag. On recent macOS versions this often appears as **“已损坏 / is damaged”** (not a corrupt download).

Clear quarantine, then open the app:

```bash
# If you copied the app to Applications:
xattr -cr /Applications/SwiftMesh.app

# Or point at the .app wherever you placed it, for example:
# xattr -cr /path/to/SwiftMesh.app
```

Then launch SwiftMesh normally (Spotlight, Finder, or Dock).

Right-click → **Open** sometimes works for “unidentified developer”, but for the **“damaged”** dialog, `xattr -cr` is the reliable fix.

### Features

- Open local models via **File → Open…** (Ctrl+O / ⌘O), drag-and-drop, or Open Recent
- Multi-tab viewing and camera controls
- Inspect hierarchy, textures, materials, geometries, and model info
- Record a turntable clip (MP4 / WebM) with size and quality presets (MP4 via bundled ffmpeg)
- Preferences: appearance themes, lighting, recording output folder, performance options, updates, and About
- UI language: English / 中文
- Optional auto-update from GitHub Releases (Windows NSIS; macOS zip channel)

### Quick usage

1. Install and launch SwiftMesh.
2. Open a `.glb`, `.gltf`, or `.obj` file.
3. Use the viewport toolbar for Hierarchy / Textures / Materials / Geometries / Info.
4. Adjust lighting and camera as needed.
5. In **Record**, pick export format, size, and quality, then record one revolution.
6. Open **Preferences** (Ctrl+, / ⌘,) for themes, performance, recording save location, updates, and license/repo info.

Remote URL / cloud loading is not included.

---

## For developers

### Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- **Windows packaging:** Windows x64 (or CI `windows-latest`)
- **macOS packaging:** macOS host (or CI `macos-latest`); needs `iconutil` for `.icns`

### Setup

```bash
pnpm install
pnpm run dev          # Vite + Electron
```

### Scripts

| Script | Description |
| --- | --- |
| `pnpm run dev` | Development app (syncs glTF vendor assets, then Vite + Electron) |
| `pnpm run build` | Typecheck + production renderer / Electron bundles |
| `pnpm run sync:vendor` | Copy Draco / Basis transcoder assets into `public/vendor` |
| `pnpm run brand-icons` | Generate Windows `.ico` (and `.icns` on macOS) |
| `pnpm run prepare-ffmpeg-mac` | Download darwin arm64/x64 ffmpeg into `build/ffmpeg/` |
| `pnpm run dist:win` | Build NSIS installer + portable exe under `release/` |
| `pnpm run dist:win:publish` | Build **NSIS only** and publish to GitHub Releases (local) |
| `pnpm run dist:mac` | Build arm64 + x64 DMG and ZIP under `release/` |
| `pnpm run preview` | Vite preview of the renderer build |

### Project layout

```text
swiftmesh/
├── electron/          # Main process (window, IPC, ffmpeg, updater, recent files)
├── src/               # Renderer (React UI + Three.js viewer)
│   ├── components/    # App shell, viewer, preferences, inspect panels
│   ├── lib/           # Preferences, recording, themes, loaders, session
│   ├── i18n/          # en / zh messages
│   ├── uiTheme/       # Material UI theme wiring
│   └── previewTheme/  # Model preview theme
├── public/vendor/     # Draco / Basis assets used by glTF loaders
├── scripts/           # Vendor sync, brand icons, mac ffmpeg prep
├── build/             # Packaging icons / resources
├── .github/workflows/ # Tag-triggered release builds
└── release/           # electron-builder output (gitignored locally)
```

### Releases & auto-update

Preferred path: **push a version tag** and let GitHub Actions build Windows + macOS, then attach artifacts to the same Release.

1. Bump `version` in `package.json` and commit.
2. Tag and push:

```bash
git tag v0.2.5
git push origin v0.2.5
```

3. Workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) runs two jobs:
   - `windows-latest` → `pnpm run dist:win` → uploads `.exe`, blockmaps, `latest.yml`
   - `macos-latest` → `pnpm run dist:mac` → uploads `.dmg` / `.zip`, blockmaps, `latest-mac.yml`

In-app updates:

- **Windows NSIS** reads `latest.yml`
- **macOS** reads `latest-mac.yml` (zip artifacts)

Local packaging (optional, for debugging):

```bash
pnpm run dist:win    # on Windows
pnpm run dist:mac    # on macOS
```

`pnpm run dist:win:publish` remains available for a Windows-only local publish with `GH_TOKEN`.

Repository: [somertang/swiftmesh](https://github.com/somertang/swiftmesh)

---

## License

MIT © [Somer Tang](https://github.com/somertang) — see [LICENSE](./LICENSE).
