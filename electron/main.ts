import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { constants as fsConstants, watch as fsWatch, type FSWatcher } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  convertWebmToMp4,
  encodePngFramesToMp4,
  encodePngFramesToWebm,
  verifyEncodedVideo,
} from './ffmpeg'
import type {
  AppendRecordingFramePayload,
  FinishRecordingSessionPayload,
  OpenedModel,
  OpenedModelCompanion,
  RecordingExportFormat,
  RecordingQuality,
  SaveRecordingPayload,
  StartRecordingSessionPayload,
  WindowMenuAction,
} from '../src/desktopTypes'
import {
  collectGltfSidecarUris,
  collectMtlTextureUris,
  collectObjMtllibs,
  detectModelFormat,
  normalizeAssetPath,
} from '../src/lib/modelSource'
import {
  isLocale,
  translate,
  type Locale,
  type MessageKey,
} from '../src/i18n/messages'
import {
  DEFAULT_PREVIEW_THEME,
  isPreviewTheme,
  type PreviewTheme,
} from '../src/lib/previewTheme'
import {
  addRecentPath,
  clearRecentPaths,
  loadRecentPaths,
  removeRecentPath,
  setRecentMax,
} from './recentFiles'
import {
  bindUpdaterContext,
  checkForAppUpdates,
  dismissPendingUpdate,
  downloadPendingUpdate,
  getAppVersion,
  getUpdateStatus,
  quitAndInstallUpdate,
  setAutoUpdateEnabled,
} from './updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let appLocale: Locale = 'en'
let appPreviewTheme: PreviewTheme = DEFAULT_PREVIEW_THEME
/** Preferred cache/temp root from renderer prefs; empty = OS temp. */
let appCacheDir = ''

type ModelWatchEntry = {
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
}

const modelWatchers = new Map<string, ModelWatchEntry>()

function normalizeWatchPath(filePath: string): string {
  return path.normalize(filePath.trim())
}

function clearModelWatchers() {
  for (const entry of modelWatchers.values()) {
    if (entry.timer) clearTimeout(entry.timer)
    entry.watcher.close()
  }
  modelWatchers.clear()
}

function syncModelWatchers(paths: string[]) {
  const wanted = new Set(
    paths
      .filter(p => typeof p === 'string' && p.trim() && path.isAbsolute(p))
      .map(normalizeWatchPath)
  )

  for (const [watched, entry] of modelWatchers) {
    if (wanted.has(watched)) continue
    if (entry.timer) clearTimeout(entry.timer)
    entry.watcher.close()
    modelWatchers.delete(watched)
  }

  for (const filePath of wanted) {
    if (modelWatchers.has(filePath)) continue
    try {
      const watcher = fsWatch(filePath, () => {
        const entry = modelWatchers.get(filePath)
        if (!entry) return
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = setTimeout(() => {
          entry.timer = null
          mainWindow?.webContents.send('desktop:model-file-changed', filePath)
        }, 400)
      })
      watcher.on('error', () => {
        const entry = modelWatchers.get(filePath)
        if (!entry) return
        if (entry.timer) clearTimeout(entry.timer)
        entry.watcher.close()
        modelWatchers.delete(filePath)
      })
      modelWatchers.set(filePath, { watcher, timer: null })
    } catch {
      /* Missing path or unsupported watch — skip. */
    }
  }
}

async function resolveTempRoot(): Promise<string> {
  const dir = appCacheDir.trim()
  if (!dir) return os.tmpdir()
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.access(dir, fsConstants.W_OK)
    return dir
  } catch {
    return os.tmpdir()
  }
}

function t(key: MessageKey, vars?: Record<string, string | number>) {
  return translate(appLocale, key, vars)
}

function applyAppPreviewTheme(theme: PreviewTheme) {
  appPreviewTheme = theme
}

type RecordingSession = {
  tempDir: string
  framesDir: string
  defaultName: string
  format: RecordingExportFormat
  quality: RecordingQuality
  fps: number
}

const recordingSessions = new Map<string, RecordingSession>()

function stripVideoExtension(name: string) {
  return name.replace(/\.(webm|mp4)$/i, '')
}

function formatRecordingTimestamp(date = new Date()) {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

function sanitizeRecordingStem(name: string) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'turntable'
}

function buildTimestampedStem(defaultName: string) {
  const base = sanitizeRecordingStem(stripVideoExtension(defaultName) || 'turntable')
  return `${base}_${formatRecordingTimestamp()}`
}

async function isWritableDirectory(dir: string) {
  try {
    const st = await fs.stat(dir)
    if (!st.isDirectory()) return false
    await fs.access(dir, fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

async function allocateUniqueFilePath(dir: string, stem: string, ext: string) {
  let candidate = path.join(dir, `${stem}.${ext}`)
  let suffix = 1
  for (;;) {
    try {
      await fs.access(candidate)
      candidate = path.join(dir, `${stem}_${suffix}.${ext}`)
      suffix += 1
    } catch {
      return candidate
    }
  }
}

/**
 * Resolve save path: silent write into outputDir when valid; otherwise Save As.
 * Always suggests a timestamped stem to avoid overwriting prior exports.
 */
async function resolveRecordingSavePath(options: {
  defaultName: string
  format: RecordingExportFormat
  outputDir?: string
}): Promise<string | null> {
  if (!mainWindow) return null

  const stem = buildTimestampedStem(options.defaultName)
  const defaultExt = options.format === 'webm' ? 'webm' : 'mp4'
  const filters =
    options.format === 'webm'
      ? [{ name: 'WebM Video', extensions: ['webm'] }]
      : options.format === 'mp4'
        ? [{ name: 'MP4 Video', extensions: ['mp4'] }]
        : [{ name: 'MP4 + WebM', extensions: ['mp4'] }]

  const outputDir = typeof options.outputDir === 'string' ? options.outputDir.trim() : ''
  if (outputDir) {
    if (await isWritableDirectory(outputDir)) {
      return allocateUniqueFilePath(outputDir, stem, defaultExt)
    }
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: t('record.outputDir.invalidTitle'),
      message: t('record.outputDir.invalidMessage'),
      detail: outputDir,
      buttons: [t('common.ok')],
      defaultId: 0,
    })
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: t('record.saveDialogTitle'),
    defaultPath: outputDir ? path.join(outputDir, `${stem}.${defaultExt}`) : `${stem}.${defaultExt}`,
    filters,
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

async function readCompanionFile(baseDir: string, relativePath: string): Promise<OpenedModelCompanion> {
  const normalized = normalizeAssetPath(relativePath)
  const absolute = path.resolve(baseDir, normalized)
  const relative = path.relative(baseDir, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Invalid sidecar path: ${relativePath}`)
  }
  const buffer = await fs.readFile(absolute)
  return { relativePath: normalized, data: toArrayBuffer(buffer) }
}

async function collectSidecars(filePath: string, format: NonNullable<ReturnType<typeof detectModelFormat>>, mainData: ArrayBuffer): Promise<OpenedModelCompanion[]> {
  const baseDir = path.dirname(filePath)
  const companions: OpenedModelCompanion[] = []
  const seen = new Set<string>()

  const add = async (uri: string) => {
    const key = normalizeAssetPath(uri).toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    companions.push(await readCompanionFile(baseDir, uri))
  }

  if (format === 'glb') return companions

  if (format === 'gltf') {
    let json: unknown
    try {
      json = JSON.parse(new TextDecoder('utf-8').decode(mainData))
    } catch {
      throw new Error('Invalid .gltf file (JSON parse failed).')
    }
    for (const uri of collectGltfSidecarUris(json)) {
      try {
        await add(uri)
      } catch (err) {
        throw new Error(
          `Missing glTF dependency "${uri}": ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return companions
  }

  const objText = new TextDecoder('utf-8').decode(mainData)
  for (const mtl of collectObjMtllibs(objText)) {
    try {
      await add(mtl)
    } catch (err) {
      throw new Error(
        `Missing MTL "${mtl}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
    const mtlCompanion = companions.find(c => c.relativePath === normalizeAssetPath(mtl))
    if (!mtlCompanion) continue
    const mtlText = new TextDecoder('utf-8').decode(mtlCompanion.data)
    for (const tex of collectMtlTextureUris(mtlText)) {
      try {
        await add(tex)
      } catch (err) {
        throw new Error(
          `Missing texture "${tex}": ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }
  return companions
}

async function readModelFile(filePath: string): Promise<OpenedModel> {
  const format = detectModelFormat(filePath)
  if (!format) throw new Error('Not a supported model file (.glb / .gltf / .obj)')
  const buffer = await fs.readFile(filePath)
  const data = toArrayBuffer(buffer)
  const companions = await collectSidecars(filePath, format, data)
  return {
    name: path.basename(filePath),
    path: filePath,
    data,
    format,
    companions,
  }
}

async function readModelFileAndRemember(filePath: string): Promise<OpenedModel> {
  const model = await readModelFile(filePath)
  await addRecentPath(filePath)
  notifyRecentPathsChanged()
  return model
}

async function openRecentModel(filePath: string) {
  if (!mainWindow) return
  try {
    const file = await readModelFileAndRemember(filePath)
    mainWindow.webContents.send('desktop:model-opened', file)
  } catch (error) {
    await removeRecentPath(filePath)
    notifyRecentPathsChanged()
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(t('menu.recentOpenFailedTitle'), `${filePath}\n\n${message}`)
  }
}

/** Paths from OS "Open with" / shell; claimed by the renderer after it is ready. */
let pendingShellModelPaths: string[] = []
/** Once claimed, keep returning the same list (React StrictMode remounts safely). */
let claimedShellModelPaths: string[] | null = null

function collectModelPathsFromArgv(argv: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const execKey = path.resolve(process.execPath).toLowerCase()
  for (const raw of argv) {
    if (!raw || raw.startsWith('-')) continue
    let trimmed = raw.replace(/^"(.+)"$/, '$1')
    if (trimmed === '.' || /electron(\.exe)?$/i.test(trimmed)) continue
    if (/^file:/i.test(trimmed)) {
      try {
        trimmed = fileURLToPath(trimmed)
      } catch {
        continue
      }
    }
    if (!detectModelFormat(trimmed)) continue
    const resolved = path.resolve(trimmed)
    const key = resolved.toLowerCase()
    if (key === execKey || seen.has(key)) continue
    seen.add(key)
    out.push(resolved)
  }
  return out
}

function focusMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function enqueueShellModelPaths(filePaths: string[]) {
  for (const filePath of filePaths) {
    const key = filePath.toLowerCase()
    if (pendingShellModelPaths.some(p => p.toLowerCase() === key)) continue
    if (claimedShellModelPaths?.some(p => p.toLowerCase() === key)) continue
    pendingShellModelPaths.push(filePath)
  }
}

function takePendingShellModelPaths(): string[] {
  if (claimedShellModelPaths) return [...claimedShellModelPaths]
  claimedShellModelPaths = pendingShellModelPaths
  pendingShellModelPaths = []
  return [...claimedShellModelPaths]
}

/** Open paths in an already-running window (second-instance / menu). */
async function openModelsInRunningWindow(filePaths: string[]) {
  if (filePaths.length === 0 || !mainWindow) return
  for (const filePath of filePaths) {
    await openRecentModel(filePath)
  }
}

function applyAppLocale(locale: Locale) {
  appLocale = locale
}

const TITLEBAR_OVERLAY_HEIGHT = 36

function notifyRecentPathsChanged() {
  void loadRecentPaths().then(paths => {
    mainWindow?.webContents.send('desktop:recent-paths-changed', paths)
  })
}

/** Native menu bar is replaced by the in-window title bar. */
async function rebuildApplicationMenu() {
  Menu.setApplicationMenu(null)
  notifyRecentPathsChanged()
}

async function runWindowMenuAction(action: WindowMenuAction) {
  if (!mainWindow && action !== 'quit') return
  switch (action) {
    case 'quit':
      app.quit()
      break
    case 'reload':
      mainWindow?.reload()
      break
    case 'toggleDevTools':
      mainWindow?.webContents.toggleDevTools()
      break
    case 'resetZoom':
      mainWindow?.webContents.setZoomLevel(0)
      break
    case 'zoomIn':
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5)
      }
      break
    case 'zoomOut':
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5)
      }
      break
    case 'toggleFullscreen':
      if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
      break
    case 'showAbout':
      await showAboutDialog()
      break
    case 'openUserGuide':
      await openUserGuide()
      break
  }
}

async function openDefaultAppsSettings(ext?: string) {
  if (process.platform !== 'win32') {
    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: t('menu.setDefaultAppUnsupportedTitle'),
      message: t('menu.setDefaultAppUnsupportedBody'),
    }
    if (mainWindow) await dialog.showMessageBox(mainWindow, options)
    else await dialog.showMessageBox(options)
    return
  }

  if (ext) {
    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: t('menu.setDefaultAppExtHintTitle', { ext }),
      message: t('menu.setDefaultAppExtHintBody', { ext }),
      buttons: [t('menu.setDefaultAppOpen'), t('common.close')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }
    const result = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options)
    if (result.response !== 0) return
  }

  const productName = 'SwiftMesh'
  const candidates = [
    `ms-settings:defaultapps?registeredAppMachine=${encodeURIComponent(productName)}`,
    `ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(productName)}`,
    'ms-settings:defaultapps',
  ]
  for (const url of candidates) {
    try {
      await shell.openExternal(url)
      return
    } catch {
      /* try next */
    }
  }
}

function resolveAppIconPath() {
  return app.isPackaged
    ? path.join(__dirname, '../dist/favicon.ico')
    : path.join(__dirname, '../src/assets/logo.png')
}

function resolveUserGuidePath() {
  return app.isPackaged
    ? path.join(__dirname, '../dist/help/index.html')
    : path.join(__dirname, '../public/help/index.html')
}

async function openUserGuide() {
  const guidePath = resolveUserGuidePath()
  try {
    await fs.access(guidePath, fsConstants.F_OK)
  } catch {
    await dialog.showMessageBox({
      type: 'warning',
      title: t('help.missingTitle'),
      message: t('help.missingMessage'),
      buttons: [t('common.close')],
      defaultId: 0,
      noLink: true,
    })
    return
  }
  await shell.openExternal(pathToFileURL(guidePath).href)
}

async function showAboutDialog() {
  let version = app.getVersion()
  let author = 'Somer Tang'
  try {
    const raw = await fs.readFile(path.join(__dirname, '../package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { version?: string; author?: string }
    if (pkg.version) version = pkg.version
    if (typeof pkg.author === 'string' && pkg.author.trim()) author = pkg.author.trim()
  } catch {
    /* keep fallbacks */
  }

  const detail = t('menu.aboutBody', {
    version,
    author,
    description: t('menu.aboutDescription'),
  })

  const options: Electron.MessageBoxOptions = {
    type: 'info',
    title: t('menu.aboutTitle'),
    message: 'SwiftMesh',
    detail,
    icon: resolveAppIconPath(),
    buttons: ['OK'],
    defaultId: 0,
    noLink: true,
  }

  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, options)
  } else {
    await dialog.showMessageBox(options)
  }
}

async function openModelDialog() {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('menu.openDialogTitle'),
    properties: ['openFile'],
    filters: [
      { name: t('menu.filterModels'), extensions: ['glb', 'gltf', 'obj'] },
      { name: t('menu.filterGlb'), extensions: ['glb'] },
      { name: t('menu.filterGltf'), extensions: ['gltf'] },
      { name: t('menu.filterObj'), extensions: ['obj'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return readModelFileAndRemember(result.filePaths[0]!)
}

function resolveIndexHtml() {
  return path.join(__dirname, '../dist/index.html')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'SwiftMesh',
    icon: resolveAppIconPath(),
    show: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: '#1c1c1c',
            symbolColor: '#f2f2f2',
            height: TITLEBAR_OVERLAY_HEIGHT,
          },
        }
      : process.platform === 'darwin'
        ? { trafficLightPosition: { x: 14, y: 11 } }
        : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Only use Vite dev server while unpackaged. Never trust env in installed builds
  // (a leftover VITE_DEV_SERVER_URL would open DevTools and load a dead localhost page).
  const isDev = !app.isPackaged
  const devUrl = isDev ? process.env.VITE_DEV_SERVER_URL : undefined

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    const message = `Failed to load UI (${code}): ${desc}\nURL: ${url}\nindex: ${resolveIndexHtml()}`
    console.error(message)
    dialog.showErrorBox('SwiftMesh failed to load', message)
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (devUrl) {
    void mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexHtml = resolveIndexHtml()
    void mainWindow.loadFile(indexHtml).catch(error => {
      const message = `loadFile failed:\n${indexHtml}\n${error instanceof Error ? error.message : String(error)}`
      console.error(message)
      dialog.showErrorBox('SwiftMesh failed to load', message)
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function saveRecordingFiles(
  webmData: ArrayBuffer,
  format: RecordingExportFormat,
  quality: RecordingQuality,
  chosenPath: string
): Promise<string[]> {
  const stemPath = stripVideoExtension(chosenPath)
  const webmPath = `${stemPath}.webm`
  const mp4Path = `${stemPath}.mp4`
  const written: string[] = []
  const tempDir = await fs.mkdtemp(path.join(await resolveTempRoot(), 'swiftmesh-rec-'))
  const tempWebm = path.join(tempDir, 'recording.webm')

  try {
    await fs.writeFile(tempWebm, Buffer.from(webmData))

    if (format === 'webm' || format === 'both') {
      await fs.copyFile(tempWebm, webmPath)
      await verifyEncodedVideo(webmPath, 16 * 1024)
      written.push(webmPath)
    }

    if (format === 'mp4' || format === 'both') {
      await convertWebmToMp4(tempWebm, mp4Path, quality)
      await verifyEncodedVideo(mp4Path, 24 * 1024)
      written.push(mp4Path)
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }

  return written
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    focusMainWindow()
    const paths = collectModelPathsFromArgv(argv)
    if (paths.length === 0) return
    // Renderer is already listening when a second instance arrives.
    void openModelsInRunningWindow(paths)
  })

  app.whenReady().then(() => {
    void rebuildApplicationMenu()
    bindUpdaterContext({
      getMainWindow: () => mainWindow,
      getLocale: () => appLocale,
    })
    createWindow()
    const shellPaths = collectModelPathsFromArgv(process.argv)
    if (shellPaths.length > 0) {
      enqueueShellModelPaths(shellPaths)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  clearModelWatchers()
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('desktop:open-model', async () => openModelDialog())
ipcMain.handle('desktop:open-glb', async () => openModelDialog())
ipcMain.handle('desktop:take-pending-open-paths', async () => takePendingShellModelPaths())

ipcMain.handle(
  'desktop:start-recording-session',
  async (_event, payload: StartRecordingSessionPayload) => {
    if (!mainWindow) return { ok: false as const, reason: 'No window' }

    const sessionId = crypto.randomUUID()
    const tempDir = await fs.mkdtemp(path.join(await resolveTempRoot(), 'swiftmesh-frames-'))
    const framesDir = path.join(tempDir, 'frames')
    await fs.mkdir(framesDir, { recursive: true })

    recordingSessions.set(sessionId, {
      tempDir,
      framesDir,
      defaultName: payload.defaultName,
      format: payload.format,
      quality: payload.quality,
      fps: payload.fps,
    })

    return { ok: true as const, sessionId }
  }
)

ipcMain.handle(
  'desktop:append-recording-frame',
  async (_event, payload: AppendRecordingFramePayload) => {
    const session = recordingSessions.get(payload.sessionId)
    if (!session) throw new Error('Unknown recording session')

    const indexStr = String(payload.index).padStart(6, '0')
    const framePath = path.join(session.framesDir, `frame_${indexStr}.png`)
    await fs.writeFile(framePath, Buffer.from(payload.data))
  }
)

ipcMain.handle(
  'desktop:finish-recording-session',
  async (_event, payload: FinishRecordingSessionPayload) => {
    if (!mainWindow) return { ok: false as const, reason: 'No window' }

    const session = recordingSessions.get(payload.sessionId)
    if (!session) return { ok: false as const, reason: 'Unknown recording session' }

    try {
      const { tempDir, framesDir, defaultName, format, quality, fps } = session
      const outputFps = payload.fps > 0 ? payload.fps : fps
      if (payload.frameCount <= 0) {
        return { ok: false as const, reason: 'No frames captured; recording failed.' }
      }
      const mp4Temp = path.join(tempDir, 'out.mp4')
      const webmTemp = path.join(tempDir, 'out.webm')

      const sendProgress = (stage: string, percent: number) => {
        mainWindow?.webContents.send('export-progress', { stage, percent })
      }

      // Encode after all frames are written; then we prompt Save As (UX: "export first").
      const encodeBoth = format === 'both'
      if (format === 'mp4' || encodeBoth) {
        sendProgress('Encoding MP4…', 0)
        await encodePngFramesToMp4({
          framesDir,
          fps: outputFps,
          frameCount: payload.frameCount,
          quality,
          outputPath: mp4Temp,
          onProgress: pct => sendProgress('Encoding MP4…', encodeBoth ? Math.round(pct / 2) : pct),
        })
        await verifyEncodedVideo(mp4Temp, 24 * 1024)
      }
      if (format === 'webm' || encodeBoth) {
        sendProgress('Encoding WebM…', encodeBoth ? 50 : 0)
        await encodePngFramesToWebm({
          framesDir,
          fps: outputFps,
          frameCount: payload.frameCount,
          quality,
          outputPath: webmTemp,
          onProgress: pct => sendProgress('Encoding WebM…', encodeBoth ? 50 + Math.round(pct / 2) : pct),
        })
        await verifyEncodedVideo(webmTemp, 16 * 1024)
      }
      sendProgress('Done', 100)

      const chosenPath = await resolveRecordingSavePath({
        defaultName,
        format,
        outputDir: payload.outputDir,
      })
      if (!chosenPath) {
        return { ok: false as const, reason: 'canceled' }
      }

      if (format === 'mp4') {
        await fs.copyFile(mp4Temp, chosenPath)
        return { ok: true as const, path: chosenPath, paths: [chosenPath] }
      }

      if (format === 'webm') {
        await fs.copyFile(webmTemp, chosenPath)
        return { ok: true as const, path: chosenPath, paths: [chosenPath] }
      }

      // both
      const outStem = stripVideoExtension(chosenPath)
      const outMp4 = `${outStem}.mp4`
      const outWebm = `${outStem}.webm`
      await fs.copyFile(mp4Temp, outMp4)
      await fs.copyFile(webmTemp, outWebm)
      return { ok: true as const, path: outMp4, paths: [outMp4, outWebm] }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false as const, reason }
    } finally {
      recordingSessions.delete(payload.sessionId)
      await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
)

ipcMain.handle(
  'desktop:save-recording',
  async (_event, payload: SaveRecordingPayload) => {
    if (!mainWindow) return { ok: false as const, reason: 'No window' }

    const format = payload.format
    const chosenPath = await resolveRecordingSavePath({
      defaultName: payload.defaultName,
      format,
      outputDir: payload.outputDir,
    })
    if (!chosenPath) {
      return { ok: false as const, reason: 'canceled' }
    }

    try {
      const paths = await saveRecordingFiles(payload.data, format, payload.quality, chosenPath)
      const primary = paths.find(p => p.endsWith('.mp4')) ?? paths[0]!
      return { ok: true as const, path: primary, paths }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false as const, reason }
    }
  }
)

ipcMain.handle('desktop:choose-recording-output-dir', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('record.outputDir.chooseTitle'),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

ipcMain.handle('desktop:choose-cache-dir', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('prefs.cacheDir.chooseTitle'),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

ipcMain.handle('desktop:set-cache-dir', async (_event, dir: string) => {
  appCacheDir = typeof dir === 'string' ? dir.trim() : ''
})

ipcMain.handle('desktop:set-watched-model-paths', async (_event, paths: string[]) => {
  syncModelWatchers(Array.isArray(paths) ? paths : [])
})

ipcMain.handle('desktop:read-model-path', async (_event, filePath: string) => {
  return readModelFileAndRemember(filePath)
})

ipcMain.handle('desktop:read-glb-path', async (_event, filePath: string) => {
  return readModelFileAndRemember(filePath)
})

ipcMain.handle('desktop:remember-recent-path', async (_event, filePath: string) => {
  await addRecentPath(filePath)
  notifyRecentPathsChanged()
})

ipcMain.handle('desktop:get-recent-paths', async () => loadRecentPaths())

ipcMain.handle('desktop:set-recent-max', async (_event, max: number) => {
  const paths = await setRecentMax(max)
  notifyRecentPathsChanged()
  return paths
})

ipcMain.handle('desktop:clear-recent-paths', async () => {
  const paths = await clearRecentPaths()
  notifyRecentPathsChanged()
  return paths
})

ipcMain.handle('desktop:window-menu-action', async (_event, action: WindowMenuAction) => {
  await runWindowMenuAction(action)
})

ipcMain.handle('desktop:check-for-updates', async () => {
  await checkForAppUpdates({ silent: false })
})

ipcMain.handle('desktop:get-app-version', async () => getAppVersion())

ipcMain.handle('desktop:get-update-status', async () => getUpdateStatus())

ipcMain.handle('desktop:install-update', async () => quitAndInstallUpdate())

ipcMain.handle('desktop:download-update', async () => {
  const result = await downloadPendingUpdate()
  return result.ok === true
})

ipcMain.handle('desktop:dismiss-update', async () => {
  dismissPendingUpdate()
})

ipcMain.handle('desktop:set-auto-update-enabled', async (_event, enabled: boolean) => {
  setAutoUpdateEnabled(enabled === true)
  if (enabled === true && app.isPackaged) {
    void checkForAppUpdates({ silent: true })
  }
})

ipcMain.handle('desktop:open-external-url', async (_event, url: string) => {
  if (typeof url !== 'string') return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return
  await shell.openExternal(parsed.toString())
})

ipcMain.handle('desktop:get-window-chrome', async () => ({
  titleBarOverlay: process.platform === 'win32',
  overlayHeight: TITLEBAR_OVERLAY_HEIGHT,
  isPackaged: app.isPackaged,
}))

ipcMain.handle('desktop:set-locale', async (_event, locale: string) => {
  if (!isLocale(locale)) return
  applyAppLocale(locale)
})

ipcMain.handle('desktop:set-preview-theme', async (_event, theme: string) => {
  if (!isPreviewTheme(theme)) return
  applyAppPreviewTheme(theme)
})

ipcMain.handle('desktop:open-default-apps-settings', async (_event, ext?: string) => {
  await openDefaultAppsSettings(typeof ext === 'string' ? ext : undefined)
})

ipcMain.handle('desktop:show-item-in-folder', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})
