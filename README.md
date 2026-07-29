# SwiftMesh

Standalone Windows desktop app for viewing local `.glb` models, inspecting scene data, and recording a one-revolution turntable video.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Windows x64 (packaging targets NSIS + portable)

## Scripts

```bash
pnpm install
pnpm run icons    # generate Material Symbols CSS
pnpm run dev      # Vite + Electron
pnpm run build    # production renderer + electron bundles
pnpm run dist:win # NSIS installer + portable exe under release/
```

## Usage

- **File → Open…** (Ctrl+O) or the Open button / file picker / drag-drop a `.glb`
- Tune camera in the left panel
- Use the viewport toolbar for Hierarchy / Textures / Materials / Geometries / Info
- In **Record**, choose **Export** (MP4 / WebM / MP4 + WebM), **Size** (viewport or PC/mobile presets), and **Quality** (Low / Medium / High), then **Record 1 rev**
- After recording, pick a save path; MP4 uses bundled ffmpeg (H.264), cover-cropped to the selected size. Higher quality increases file size and export time.

Remote URL / S3 loading is intentionally not included in this MVP.

## Rename local clone (optional)

If your checkout folder or remote URL still uses the old name (`model-viewer-desktop`), you can align them without changing app behavior:

1. **Close the app and any terminals** using this directory.
2. **Rename the folder** (example on Windows PowerShell, one level above the repo):

   ```powershell
   Rename-Item -Path "model-viewer-desktop" -NewName "swiftmesh"
   ```

3. **Open the project** from the new path and run `pnpm install` if needed.
4. **Update git remote** (only if your hosting URL changed), e.g.:

   ```bash
   git remote -v
   git remote set-url origin https://github.com/YOUR_ORG/swiftmesh.git
   ```

5. **Note on installs:** `appId` is now `com.swiftmesh.app`. An older build installed under `com.alvanon.model-viewer-desktop` is treated as a separate app; uninstall the old one if you no longer need it.
