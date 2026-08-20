import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { constants as fsConstants, watch as fsWatch, type FSWatcher } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  convertWebmToMp4,
  encodePngFramesToMp4,
  encodePngFramesToWebm,
  verifyEncodedVideo,
} from './ffmpeg'
import { finishImagesExport } from './recordingImages'
import { needsExportMask } from '../src/lib/recordingPresets'
import type {
  AppendRecordingFramePayload,
  FinishRecordingSessionPayload,
  OpenedModel,
  OpenedModelCompanion,
  OpenModelResult,
  RecordingExportFormat,
  RecordingImagesOptions,
  RecordingQuality,
  RecordingSessionFormat,
  SaveRecordingPayload,
  StartRecordingSessionPayload,
  WindowMenuAction,
} from '../src/desktopTypes'
import {
  collectGltfSidecarUris,
  collectMtlTextureUris,
  collectObjMtllibs,
  detectModelFormat,
  isEncryptedModelFileName,
  isFbxTextureFileName,
  isModelFileName,
  MODEL_FORMAT_LIST,
  normalizeAssetPath,
  stemFromName,
} from '../src/lib/modelSource'
import {
  isSmshBytes,
  packBundle,
  unpackBundle,
  SmshFormatError,
} from '../src/lib/smsh/container'
import {
  isPermissionExpired,
  normalizePermissions,
  type ModelPermissions,
} from '../src/lib/smsh/permissions'
import { encryptSmsh, decryptSmsh } from './smshCrypto'
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
import { buildDarwinApplicationMenu } from './appMenu'

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

/** Permissions for unlocked .smsh models, keyed by absolute path (normalized). */
const modelPermissionsByPath = new Map<string, ModelPermissions>()

function normalizePermPath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/').toLowerCase()
}

function rememberPermissions(filePath: string, permissions: ModelPermissions | undefined) {
  const key = normalizePermPath(filePath)
  if (permissions) modelPermissionsByPath.set(key, permissions)
  else modelPermissionsByPath.delete(key)
}

function getPermissionsForPath(filePath: string | undefined | null): ModelPermissions | null {
  if (!filePath) return null
  return modelPermissionsByPath.get(normalizePermPath(filePath)) ?? null
}

function denyUnlessAllowed(
  sourcePath: string | undefined,
  allowed: (p: ModelPermissions) => boolean,
  reason: string
): string | null {
  const perms = getPermissionsForPath(sourcePath)
  if (!perms) return null
  if (!allowed(perms)) return reason
  return null
}

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
  /** Grayscale mask PNGs (JPEG + no background). */
  masksDir?: string
  defaultName: string
  format: RecordingSessionFormat
  quality: RecordingQuality
  fps: number
  images?: RecordingImagesOptions
}

const recordingSessions = new Map<string, RecordingSession>()

function stripVideoExtension(name: string) {
  return name.replace(/\.(webm|mp4)$/i, '')
}

function sanitizeRecordingStem(name: string) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'turntable'
}

function buildRecordingStem(defaultName: string) {
  return sanitizeRecordingStem(stripVideoExtension(defaultName) || 'turntable')
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

async function allocateUniqueStem(dir: string, stem: string): Promise<string> {
  let candidate = stem
  let suffix = 1
  for (;;) {
    const framesDir = path.join(dir, `${candidate}_frames`)
    const framesZip = path.join(dir, `${candidate}_frames.zip`)
    const atlasProbe = path.join(dir, `${candidate}_atlas_01.png`)
    const atlasProbeJpg = path.join(dir, `${candidate}_atlas_01.jpg`)
    const atlasProbeWebp = path.join(dir, `${candidate}_atlas_01.webp`)
    const atlasMaskProbe = path.join(dir, `${candidate}_atlas_01_mask.png`)
    try {
      await Promise.any([
        fs.access(framesDir),
        fs.access(framesZip),
        fs.access(atlasProbe),
        fs.access(atlasProbeJpg),
        fs.access(atlasProbeWebp),
        fs.access(atlasMaskProbe),
      ])
      candidate = `${stem}_${suffix}`
      suffix += 1
    } catch {
      return candidate
    }
  }
}

/**
 * Resolve save path: silent write into outputDir when valid; otherwise Save As.
 * Uses the sanitized defaultName stem; allocateUniqueFilePath adds _1/_2 on collision.
 */
async function resolveRecordingSavePath(options: {
  defaultName: string
  format: RecordingExportFormat
  outputDir?: string
}): Promise<string | null> {
  if (!mainWindow) return null

  const stem = buildRecordingStem(options.defaultName)
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

async function resolveImagesOutputBase(options: {
  defaultName: string
  outputDir?: string
}): Promise<{ dir: string; stem: string } | null> {
  if (!mainWindow) return null

  const baseStem = buildRecordingStem(options.defaultName)
  const outputDir = typeof options.outputDir === 'string' ? options.outputDir.trim() : ''

  if (outputDir) {
    if (await isWritableDirectory(outputDir)) {
      const stem = await allocateUniqueStem(outputDir, baseStem)
      return { dir: outputDir, stem }
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
    defaultPath: outputDir ? path.join(outputDir, baseStem) : baseStem,
    filters: [{ name: 'Images export', extensions: ['*'] }],
  })
  if (result.canceled || !result.filePath) return null

  const chosen = result.filePath
  const dir = path.dirname(chosen)
  const rawStem = sanitizeRecordingStem(path.basename(chosen).replace(/\.[^.]+$/, '') || baseStem)
  const stem = await allocateUniqueStem(dir, rawStem || baseStem)
  return { dir, stem }
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

  if (format === 'fbx') {
    const stem = stemFromName(filePath)
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !isFbxTextureFileName(entry.name)) continue
        try {
          await add(entry.name)
        } catch {
          /* optional textures */
        }
      }
    } catch {
      /* ignore unreadable directory */
    }
    const fbmDir = path.join(baseDir, `${stem}.fbm`)
    try {
      const fbmEntries = await fs.readdir(fbmDir, { withFileTypes: true })
      for (const entry of fbmEntries) {
        if (!entry.isFile() || !isFbxTextureFileName(entry.name)) continue
        try {
          await add(`${stem}.fbm/${entry.name}`)
        } catch {
          /* optional textures */
        }
      }
    } catch {
      /* no .fbm folder */
    }
    return companions
  }

  if (format !== 'obj') return companions

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

async function peekSmshMagic(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(6)
    const { bytesRead } = await handle.read(buf, 0, 6, 0)
    if (bytesRead < 6) return false
    return isSmshBytes(new Uint8Array(buf.buffer, buf.byteOffset, 6))
  } finally {
    await handle.close()
  }
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function readModelFile(filePath: string): Promise<OpenModelResult> {
  if (isEncryptedModelFileName(filePath)) {
    return {
      kind: 'locked',
      name: path.basename(filePath),
      path: filePath,
    }
  }

  const format = detectModelFormat(filePath)
  if (!format) {
    if (await peekSmshMagic(filePath)) {
      return {
        kind: 'locked',
        name: path.basename(filePath),
        path: filePath,
      }
    }
    throw new Error(`Not a supported model file (${MODEL_FORMAT_LIST})`)
  }

  const buffer = await fs.readFile(filePath)
  if (isSmshBytes(new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(6, buffer.byteLength)))) {
    return {
      kind: 'locked',
      name: path.basename(filePath),
      path: filePath,
    }
  }

  const data = toArrayBuffer(buffer)
  const companions = await collectSidecars(filePath, format, data)
  return {
    kind: 'model',
    name: path.basename(filePath),
    path: filePath,
    data,
    format,
    companions,
  }
}

async function readModelFileAndRemember(filePath: string): Promise<OpenModelResult> {
  const model = await readModelFile(filePath)
  await addRecentPath(filePath)
  notifyRecentPathsChanged()
  return model
}

async function unlockModelFile(
  filePath: string,
  password: string
): Promise<
  | { ok: true; model: OpenedModel }
  | { ok: false; reason: 'bad-password' | 'expired' | string }
> {
  try {
    const buffer = await fs.readFile(filePath)
    const fileBytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    let decrypted: Awaited<ReturnType<typeof decryptSmsh>>
    try {
      decrypted = await decryptSmsh(fileBytes, password)
    } catch (err) {
      if (err instanceof SmshFormatError) {
        return { ok: false, reason: 'bad-password' }
      }
      throw err
    }

    const permissions = normalizePermissions(decrypted.permissions)
    if (isPermissionExpired(permissions)) {
      return { ok: false, reason: 'expired' }
    }

    const bundle = unpackBundle(decrypted.plaintext)
    const mainEntry = bundle.entries.find(e => e.path === bundle.manifest.mainPath)
    if (!mainEntry) {
      return { ok: false, reason: 'Bundle missing main entry' }
    }

    const companions: OpenedModelCompanion[] = bundle.entries
      .filter(e => e.path !== bundle.manifest.mainPath)
      .map(e => ({
        relativePath: e.path,
        data: uint8ToArrayBuffer(e.data),
      }))

    const model: OpenedModel = {
      name: path.basename(filePath),
      path: filePath,
      data: uint8ToArrayBuffer(mainEntry.data),
      format: bundle.manifest.format,
      companions,
      permissions,
    }

    rememberPermissions(filePath, permissions)
    await addRecentPath(filePath)
    notifyRecentPathsChanged()
    return { ok: true, model }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, reason }
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function uniqueSmshOutPath(dir: string, stem: string): Promise<string> {
  const safeStem = stem.replace(/[<>:"/\\|?*]/g, '_') || 'model'
  let candidate = path.join(dir, `${safeStem}.smsh`)
  let n = 1
  while (await pathExists(candidate)) {
    candidate = path.join(dir, `${safeStem} (${n}).smsh`)
    n += 1
  }
  return candidate
}

async function buildEncryptedSmshBytes(
  sourcePath: string,
  password: string,
  permissions: ModelPermissions
): Promise<Uint8Array> {
  const opened = await readModelFile(sourcePath)
  if (opened.kind !== 'model') {
    throw new Error('Source is not a plain model file')
  }

  const mainPath = opened.name || path.basename(sourcePath)
  const entries = [
    { path: mainPath, data: new Uint8Array(opened.data) },
    ...(opened.companions ?? []).map(c => ({
      path: c.relativePath,
      data: new Uint8Array(c.data),
    })),
  ]
  const plaintext = packBundle({
    manifest: {
      format: opened.format,
      mainPath,
      entries: entries.map(e => ({ path: e.path, byteLength: e.data.byteLength })),
    },
    entries,
  })

  return encryptSmsh({ plaintext, password, permissions: normalizePermissions(permissions) })
}

async function encryptModelFile(payload: {
  sourcePath: string
  password: string
  permissions: ModelPermissions
}): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (!mainWindow) return { ok: false, reason: 'No window' }

  const sourcePath = typeof payload?.sourcePath === 'string' ? payload.sourcePath.trim() : ''
  if (!sourcePath) return { ok: false, reason: 'Missing source path' }
  if (isEncryptedModelFileName(sourcePath)) {
    return { ok: false, reason: 'Source is already an encrypted .smsh file' }
  }

  const password = typeof payload?.password === 'string' ? payload.password : ''
  if (!password) return { ok: false, reason: 'Missing password' }

  try {
    const encrypted = await buildEncryptedSmshBytes(sourcePath, password, payload.permissions)

    const stem = stemFromName(sourcePath).replace(/[<>:"/\\|?*]/g, '_') || 'model'
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t('menu.encryptDialogTitle'),
      defaultPath: `${stem}.smsh`,
      filters: [{ name: t('menu.filterSmsh'), extensions: ['smsh'] }],
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, reason: 'canceled' }
    }
    const outPath = result.filePath.toLowerCase().endsWith('.smsh')
      ? result.filePath
      : `${result.filePath}.smsh`

    await fs.writeFile(outPath, Buffer.from(encrypted))
    return { ok: true, path: outPath }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, reason }
  }
}

let batchEncryptCancelRequested = false

async function pickModelsForBatchEncrypt(): Promise<string[] | null> {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('menu.encryptBatch'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: t('menu.filterModels'), extensions: ['glb', 'gltf', 'obj', 'fbx'] },
      { name: 'GLB', extensions: ['glb'] },
      { name: 'glTF', extensions: ['gltf'] },
      { name: 'OBJ', extensions: ['obj'] },
      { name: 'FBX', extensions: ['fbx'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths.filter(p => !isEncryptedModelFileName(p))
}

async function encryptModelsBatch(payload: {
  sourcePaths: string[]
  password: string
  permissions: ModelPermissions
  /** When set, write all .smsh into this folder; otherwise beside each source. */
  outputDir: string | null
}): Promise<{
  ok: true
  results: Array<{ sourcePath: string; path?: string; error?: string }>
  canceled: boolean
}> {
  const password = typeof payload?.password === 'string' ? payload.password : ''
  const sourcePaths = Array.isArray(payload?.sourcePaths)
    ? payload.sourcePaths.map(p => String(p).trim()).filter(Boolean)
    : []
  const permissions = normalizePermissions(payload.permissions)
  const outputDir =
    typeof payload?.outputDir === 'string' && payload.outputDir.trim()
      ? path.resolve(payload.outputDir.trim())
      : null

  batchEncryptCancelRequested = false
  const results: Array<{ sourcePath: string; path?: string; error?: string }> = []

  for (let i = 0; i < sourcePaths.length; i++) {
    if (batchEncryptCancelRequested) {
      return { ok: true, results, canceled: true }
    }
    const sourcePath = sourcePaths[i]!
    mainWindow?.webContents.send('desktop:encrypt-batch-progress', {
      index: i + 1,
      total: sourcePaths.length,
      fileName: path.basename(sourcePath),
    })

    if (isEncryptedModelFileName(sourcePath)) {
      results.push({ sourcePath, error: 'Already an encrypted .smsh file' })
      continue
    }

    try {
      const encrypted = await buildEncryptedSmshBytes(sourcePath, password, permissions)
      const stem = stemFromName(sourcePath)
      const dir = outputDir ?? path.dirname(sourcePath)
      const outPath = await uniqueSmshOutPath(dir, stem)
      await fs.writeFile(outPath, Buffer.from(encrypted))
      results.push({ sourcePath, path: outPath })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      results.push({ sourcePath, error: reason })
    }
  }

  return { ok: true, results, canceled: false }
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
    if (!isModelFileName(trimmed)) continue
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
  void rebuildApplicationMenu()
}

const TITLEBAR_OVERLAY_HEIGHT = 44
/** macOS traffic lights at trafficLightPosition.x=14 + button cluster + gap. */
const TRAFFIC_LIGHT_CONTROLS_INSET = 80

function notifyRecentPathsChanged() {
  void loadRecentPaths().then(paths => {
    mainWindow?.webContents.send('desktop:recent-paths-changed', paths)
    void rebuildApplicationMenu(paths)
  })
}

function sendToRenderer(channel: string) {
  mainWindow?.webContents.send(channel)
}

async function openModelFromMenu() {
  const file = await openModelDialog()
  if (!file || !mainWindow) return
  mainWindow.webContents.send('desktop:model-opened', file)
}

/** macOS: system menu bar. Windows/Linux: null (in-window title bar menus). */
async function rebuildApplicationMenu(recentPaths?: string[]) {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  const paths = recentPaths ?? (await loadRecentPaths())
  const menu = buildDarwinApplicationMenu({
    t,
    recentPaths: paths,
    isPackaged: app.isPackaged,
    onOpen: () => {
      void openModelFromMenu()
    },
    onOpenRecent: filePath => {
      void openRecentModel(filePath)
    },
    onClearRecent: () => {
      void clearRecentPaths().then(() => notifyRecentPathsChanged())
    },
    onOpenPreferences: () => sendToRenderer('desktop:open-preferences'),
    onEncryptModel: () => sendToRenderer('desktop:encrypt-model-request'),
    onEncryptModelsBatch: () => sendToRenderer('desktop:encrypt-models-batch-request'),
    onToggleStatusBar: () => sendToRenderer('desktop:toggle-status-bar'),
    onReload: () => {
      void runWindowMenuAction('reload')
    },
    onToggleDevTools: () => {
      void runWindowMenuAction('toggleDevTools')
    },
    onResetZoom: () => {
      void runWindowMenuAction('resetZoom')
    },
    onZoomIn: () => {
      void runWindowMenuAction('zoomIn')
    },
    onZoomOut: () => {
      void runWindowMenuAction('zoomOut')
    },
    onToggleFullscreen: () => {
      void runWindowMenuAction('toggleFullscreen')
    },
    onOpenUserGuide: () => {
      void runWindowMenuAction('openUserGuide')
    },
    onShowAbout: () => {
      void runWindowMenuAction('showAbout')
    },
  })
  Menu.setApplicationMenu(menu)
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

const USER_GUIDE_URL = 'https://somertang.github.io/swiftmesh/help/'

async function openUserGuide() {
  try {
    await shell.openExternal(USER_GUIDE_URL)
  } catch (error) {
    await dialog.showMessageBox({
      type: 'warning',
      title: t('help.openFailedTitle'),
      message:
        error instanceof Error
          ? error.message
          : t('help.openFailedMessage'),
      buttons: [t('common.close')],
      defaultId: 0,
      noLink: true,
    })
  }
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
      { name: t('menu.filterModels'), extensions: ['glb', 'gltf', 'obj', 'fbx', 'smsh'] },
      { name: t('menu.filterGlb'), extensions: ['glb'] },
      { name: t('menu.filterGltf'), extensions: ['gltf'] },
      { name: t('menu.filterObj'), extensions: ['obj'] },
      { name: t('menu.filterFbx'), extensions: ['fbx'] },
      { name: t('menu.filterSmsh'), extensions: ['smsh'] },
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
    backgroundColor: '#141A21',
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: '#141A21',
            symbolColor: '#FFFFFF',
            height: TITLEBAR_OVERLAY_HEIGHT,
          },
        }
      : process.platform === 'darwin'
        ? { trafficLightPosition: { x: 14, y: 14 } }
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
  'desktop:unlock-model',
  async (_event, payload: { path?: string; password?: string }) => {
    const filePath = typeof payload?.path === 'string' ? payload.path.trim() : ''
    const password = typeof payload?.password === 'string' ? payload.password : ''
    if (!filePath) return { ok: false as const, reason: 'Missing path' }
    if (!password) return { ok: false as const, reason: 'Missing password' }
    return unlockModelFile(filePath, password)
  }
)

ipcMain.handle(
  'desktop:encrypt-model',
  async (
    _event,
    payload: { sourcePath?: string; password?: string; permissions?: ModelPermissions }
  ) => {
    return encryptModelFile({
      sourcePath: payload?.sourcePath ?? '',
      password: payload?.password ?? '',
      permissions: normalizePermissions(payload?.permissions),
    })
  }
)

ipcMain.handle('desktop:pick-models-for-batch-encrypt', async () => pickModelsForBatchEncrypt())

ipcMain.handle(
  'desktop:encrypt-models-batch',
  async (
    _event,
    payload: {
      sourcePaths?: string[]
      password?: string
      permissions?: ModelPermissions
      outputDir?: string | null
    }
  ) => {
    return encryptModelsBatch({
      sourcePaths: payload?.sourcePaths ?? [],
      password: payload?.password ?? '',
      permissions: normalizePermissions(payload?.permissions),
      outputDir: payload?.outputDir ?? null,
    })
  }
)

ipcMain.handle('desktop:cancel-encrypt-batch', async () => {
  batchEncryptCancelRequested = true
})

ipcMain.handle('desktop:choose-encrypt-output-dir', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('encrypt.batch.chooseOutputDir'),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

ipcMain.handle('desktop:set-content-protection', async (_event, enabled: unknown) => {
  const on = Boolean(enabled)
  try {
    mainWindow?.setContentProtection(on)
  } catch (error) {
    console.warn('[content-protection]', error)
  }
})

ipcMain.handle('desktop:write-clipboard-text', async (_event, text: string) => {
  clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''))
})

ipcMain.handle(
  'desktop:start-recording-session',
  async (_event, payload: StartRecordingSessionPayload) => {
    if (!mainWindow) return { ok: false as const, reason: 'No window' }

    if (payload.format === 'images') {
      const denied = denyUnlessAllowed(
        payload.sourcePath,
        p => p.allowRecordImages,
        'permission-denied'
      )
      if (denied) return { ok: false as const, reason: denied }

      const images = payload.images
      if (!images || (!images.exportSequence && !images.exportAtlas)) {
        return { ok: false as const, reason: 'Images export requires sequence and/or atlas.' }
      }
    } else {
      const denied = denyUnlessAllowed(
        payload.sourcePath,
        p => p.allowRecordVideo,
        'permission-denied'
      )
      if (denied) return { ok: false as const, reason: denied }
    }

    const sessionId = crypto.randomUUID()
    const tempDir = await fs.mkdtemp(path.join(await resolveTempRoot(), 'swiftmesh-frames-'))
    const framesDir = path.join(tempDir, 'frames')
    await fs.mkdir(framesDir, { recursive: true })

    const images = payload.images
    const wantsMask =
      payload.format === 'images' &&
      images != null &&
      needsExportMask({
        imageFormat: images.imageFormat,
        exportBackground: images.exportBackground,
        jpegNoBgMode: images.jpegNoBgMode,
      })
    const masksDir = wantsMask ? path.join(tempDir, 'masks') : undefined
    if (masksDir) {
      await fs.mkdir(masksDir, { recursive: true })
    }

    recordingSessions.set(sessionId, {
      tempDir,
      framesDir,
      masksDir,
      defaultName: payload.defaultName,
      format: payload.format,
      quality: payload.quality,
      fps: payload.fps,
      images: payload.images,
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
    if (payload.maskData && session.masksDir) {
      const maskPath = path.join(session.masksDir, `frame_${indexStr}_mask.png`)
      await fs.writeFile(maskPath, Buffer.from(payload.maskData))
    }
  }
)

ipcMain.handle(
  'desktop:finish-recording-session',
  async (_event, payload: FinishRecordingSessionPayload) => {
    if (!mainWindow) return { ok: false as const, reason: 'No window' }

    const session = recordingSessions.get(payload.sessionId)
    if (!session) return { ok: false as const, reason: 'Unknown recording session' }

    try {
      const { tempDir, framesDir, defaultName, format, quality, fps, images } = session
      const outputFps = payload.fps > 0 ? payload.fps : fps
      if (payload.frameCount <= 0) {
        return { ok: false as const, reason: 'No frames captured; recording failed.' }
      }

      const sendProgress = (stage: string, percent: number) => {
        mainWindow?.webContents.send('export-progress', { stage, percent })
      }

      if (format === 'images') {
        if (!images) {
          return { ok: false as const, reason: 'Missing images export options.' }
        }
        const base = await resolveImagesOutputBase({
          defaultName,
          outputDir: payload.outputDir,
        })
        if (!base) {
          return { ok: false as const, reason: 'canceled' }
        }

        const result = await finishImagesExport({
          framesDir,
          masksDir: session.masksDir,
          frameCount: payload.frameCount,
          outputDir: base.dir,
          stem: base.stem,
          images,
          onProgress: sendProgress,
        })
        return { ok: true as const, path: result.primaryPath, paths: result.paths }
      }

      const mp4Temp = path.join(tempDir, 'out.mp4')
      const webmTemp = path.join(tempDir, 'out.webm')

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

ipcMain.handle(
  'desktop:pick-images-output-base',
  async (_event, payload: { defaultName?: string; outputDir?: string }) => {
    const defaultName = typeof payload?.defaultName === 'string' ? payload.defaultName : 'export'
    const outputDir = typeof payload?.outputDir === 'string' ? payload.outputDir : ''
    return resolveImagesOutputBase({ defaultName, outputDir })
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

ipcMain.handle(
  'desktop:write-recording-manifest',
  async (
    _event,
    payload: { outputDir: string; fileName: string; json: string }
  ): Promise<{ ok: true; path: string } | { ok: false; reason: string }> => {
    const outputDir = typeof payload?.outputDir === 'string' ? payload.outputDir.trim() : ''
    const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : ''
    const json = typeof payload?.json === 'string' ? payload.json : ''
    if (!outputDir || !(await isWritableDirectory(outputDir))) {
      return { ok: false as const, reason: 'Invalid output directory' }
    }
    if (!fileName || fileName.includes('..') || /[<>:"/\\|?*]/.test(fileName)) {
      return { ok: false as const, reason: 'Invalid manifest file name' }
    }
    if (!fileName.toLowerCase().endsWith('.json')) {
      return { ok: false as const, reason: 'Manifest must be a .json file' }
    }
    try {
      JSON.parse(json)
    } catch {
      return { ok: false as const, reason: 'Invalid JSON payload' }
    }
    const outPath = path.join(outputDir, fileName)
    await fs.writeFile(outPath, json, 'utf8')
    return { ok: true as const, path: outPath }
  }
)

ipcMain.handle(
  'desktop:save-model-file',
  async (
    _event,
    payload: { defaultName?: string; data?: ArrayBuffer; sourcePath?: string }
  ): Promise<{ ok: true; path: string } | { ok: false; reason: string }> => {
    if (!mainWindow) return { ok: false as const, reason: 'No window' }
    const denied = denyUnlessAllowed(
      payload?.sourcePath,
      p => p.allowExport,
      'permission-denied'
    )
    if (denied) return { ok: false as const, reason: denied }
    const defaultName = typeof payload?.defaultName === 'string' ? payload.defaultName.trim() : ''
    const raw = payload?.data as ArrayBuffer | Buffer | Uint8Array | undefined
    let bytes: Buffer | null = null
    if (raw instanceof ArrayBuffer) bytes = Buffer.from(raw)
    else if (Buffer.isBuffer(raw)) bytes = raw
    else if (raw instanceof Uint8Array) bytes = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
    if (!bytes || bytes.byteLength === 0) {
      return { ok: false as const, reason: 'Empty file' }
    }
    const stem = (defaultName.replace(/\.[^.]+$/, '') || 'model').replace(/[<>:"/\\|?*]/g, '_')
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t('decimate.saveDialogTitle'),
      defaultPath: `${stem}.glb`,
      filters: [{ name: t('decimate.filterGlb'), extensions: ['glb'] }],
    })
    if (result.canceled || !result.filePath) {
      return { ok: false as const, reason: 'canceled' }
    }
    const outPath = result.filePath.toLowerCase().endsWith('.glb')
      ? result.filePath
      : `${result.filePath}.glb`
    try {
      await fs.writeFile(outPath, bytes)
      return { ok: true as const, path: outPath }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false as const, reason }
    }
  }
)

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
  if (enabled === true && app.isPackaged && process.platform !== 'darwin') {
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

ipcMain.handle('desktop:get-window-chrome', async () => {
  const platform =
    process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux'
  return {
    platform,
    controlsInsetLeft: platform === 'darwin' ? TRAFFIC_LIGHT_CONTROLS_INSET : 0,
    titleBarOverlay: platform === 'win32',
    overlayHeight: TITLEBAR_OVERLAY_HEIGHT,
    isPackaged: app.isPackaged,
  }
})

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

ipcMain.handle('desktop:open-path', async (_event, filePath: string) => {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false as const, reason: 'Invalid path' }
  }
  const errorMessage = await shell.openPath(filePath)
  if (errorMessage) {
    return { ok: false as const, reason: errorMessage }
  }
  return { ok: true as const }
})
