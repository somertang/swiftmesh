# SwiftMesh

Windows desktop app for viewing local 3D models, inspecting scene data, and recording a one-revolution turntable video.

**Formats:** `.glb` / `.gltf` / `.obj`  
**Stack:** Electron · React · Three.js · Vite · Material UI  
**License:** [MIT](./LICENSE)

---

## For users

### Download

Install the latest **Windows NSIS** build from:

**[Releases](https://github.com/somertang/swiftmesh/releases)**

Use the `SwiftMesh Setup x.y.z.exe` installer. Portable builds may be present in some releases; **in-app auto-update targets the NSIS install**.

### Features

- Open local models via **File → Open…** (Ctrl+O), drag-and-drop, or Open Recent
- Multi-tab viewing and camera controls
- Inspect hierarchy, textures, materials, geometries, and model info
- Record a turntable clip (MP4 / WebM) with size and quality presets (MP4 via bundled ffmpeg)
- Preferences: appearance themes, lighting, recording output folder, performance options, updates, and About
- UI language: English / 中文
- Optional auto-update from GitHub Releases (NSIS builds)

### Quick usage

1. Install and launch SwiftMesh.
2. Open a `.glb`, `.gltf`, or `.obj` file.
3. Use the viewport toolbar for Hierarchy / Textures / Materials / Geometries / Info.
4. Adjust lighting and camera as needed.
5. In **Record**, pick export format, size, and quality, then record one revolution.
6. Open **Preferences** (Ctrl+,) for themes, performance, recording save location, updates, and license/repo info.

Remote URL / cloud loading is not included.

---

## For developers

### Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Windows x64 (packaging targets NSIS + portable)

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
| `pnpm run brand-icons` | Generate Windows app icons |
| `pnpm run dist:win` | Build NSIS installer + portable exe under `release/` |
| `pnpm run dist:win:publish` | Build **NSIS only** and publish to GitHub Releases |
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
├── scripts/           # Vendor sync + brand icon generation
├── build/             # Packaging icons / resources
└── release/           # electron-builder output (gitignored locally)
```

### Releases & auto-update

1. Bump `version` in `package.json`.
2. Tag and push (for example `v0.2.0`).
3. Publish with a GitHub token that can create releases:

```bash
# PowerShell
$env:GH_TOKEN = "…"   # or rely on an already configured token
pnpm run dist:win:publish
```

That uploads the NSIS installer, blockmap, and `latest.yml` so installed NSIS builds can check for updates from Preferences → Updates.

Repository: [somertang/swiftmesh](https://github.com/somertang/swiftmesh)

---

## License

MIT © [Somer Tang](https://github.com/somertang) — see [LICENSE](./LICENSE).
