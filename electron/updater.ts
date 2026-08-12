import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { translate, type Locale, type MessageKey } from '../src/i18n/messages'
import type {
  UpdateProgressEvent,
  UpdatePromptEvent,
  UpdateStatus,
} from '../src/desktopTypes'

type AutoUpdater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  setFeedURL: (options: Record<string, unknown>) => void
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  on: (event: string, listener: (...args: any[]) => void) => void
}

type UpdateInfoLike = {
  version?: string
  releaseName?: string | null
  releaseNotes?: string | Array<{ version: string; note: string | null }> | null
}

const MAC_MANUAL_UPDATE = process.platform === 'darwin'
const GITHUB_REPO = 'somertang/swiftmesh'

let getMainWindow: () => BrowserWindow | null = () => null
let getLocale: () => Locale = () => 'en'
let autoUpdater: AutoUpdater | null = null
let wired = false
let checking = false
let downloading = false
let autoUpdateEnabled = true
let status: UpdateStatus = { phase: 'idle' }
let pendingVersion = ''
let pendingNotes = ''
let pendingReleaseUrl = ''
let lastPromptedVersion = ''

function t(key: MessageKey, vars?: Record<string, string | number>) {
  return translate(getLocale(), key, vars)
}

function emitStatus(next: UpdateStatus) {
  status = next
  getMainWindow()?.webContents.send('desktop:update-status', next)
}

function emitPrompt(prompt: UpdatePromptEvent) {
  getMainWindow()?.webContents.send('desktop:update-prompt', prompt)
}

function resolveGithubToken(): string | undefined {
  const fromEnv = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim()
  if (fromEnv) return fromEnv
  try {
    const tokenPath = path.join(app.getPath('userData'), 'github-update-token')
    const raw = fs.readFileSync(tokenPath, 'utf8').trim()
    return raw || undefined
  } catch {
    return undefined
  }
}

function notesFromUpdateInfo(info: UpdateInfoLike): string {
  const rn = info.releaseNotes
  if (typeof rn === 'string' && rn.trim()) return rn.trim()
  if (Array.isArray(rn)) {
    return rn
      .map(item => {
        const ver = item.version ? `## ${item.version}\n` : ''
        return `${ver}${item.note || ''}`.trim()
      })
      .filter(Boolean)
      .join('\n\n')
  }
  if (typeof info.releaseName === 'string' && info.releaseName.trim()) {
    return info.releaseName.trim()
  }
  return ''
}

function versionFromTag(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split('.').map(part => parseInt(part, 10) || 0)
  const a = parse(left)
  const b = parse(right)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

function githubReleaseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SwiftMesh',
  }
  const token = resolveGithubToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function fetchLatestGithubRelease(): Promise<{
  version: string
  releaseNotes: string
  releaseUrl: string
} | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  try {
    const res = await fetch(url, { headers: githubReleaseHeaders() })
    if (!res.ok) return null
    const data = (await res.json()) as {
      tag_name?: string
      body?: string | null
      html_url?: string
    }
    const tag = typeof data.tag_name === 'string' ? data.tag_name.trim() : ''
    if (!tag) return null
    const version = versionFromTag(tag)
    const releaseUrl =
      typeof data.html_url === 'string' && data.html_url.trim()
        ? data.html_url.trim()
        : `https://github.com/${GITHUB_REPO}/releases/tag/${encodeURIComponent(tag)}`
    let releaseNotes = typeof data.body === 'string' ? data.body.trim() : ''
    if (!releaseNotes) {
      releaseNotes = await fetchGithubReleaseNotes(version)
    }
    return { version, releaseNotes, releaseUrl }
  } catch (error) {
    console.warn('[updater] failed to fetch latest GitHub release', error)
    return null
  }
}

async function fetchGithubReleaseNotes(version: string): Promise<string> {
  const tag = version.startsWith('v') ? version : `v${version}`
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`
  try {
    const res = await fetch(url, { headers: githubReleaseHeaders() })
    if (!res.ok) return ''
    const data = (await res.json()) as { body?: string | null }
    return typeof data.body === 'string' ? data.body.trim() : ''
  } catch (error) {
    console.warn('[updater] failed to fetch release notes', error)
    return ''
  }
}

async function loadAutoUpdater(): Promise<AutoUpdater | null> {
  if (autoUpdater) return autoUpdater
  if (!app.isPackaged) return null
  try {
    const mod = (await import('electron-updater')) as {
      autoUpdater?: AutoUpdater
      default?: { autoUpdater?: AutoUpdater } | AutoUpdater
    }
    const fromNamed = mod.autoUpdater
    const fromDefault =
      mod.default && 'autoUpdater' in mod.default
        ? mod.default.autoUpdater
        : (mod.default as AutoUpdater | undefined)
    const resolved = fromNamed ?? fromDefault
    if (!resolved) throw new Error('electron-updater autoUpdater export missing')
    autoUpdater = resolved
    return autoUpdater
  } catch (error) {
    console.error('[updater] failed to load electron-updater', error)
    return null
  }
}

function wireEvents(updater: AutoUpdater) {
  if (wired) return
  wired = true

  updater.on('error', (error: Error) => {
    checking = false
    downloading = false
    getMainWindow()?.setProgressBar(-1)
    const message = error instanceof Error ? error.message : String(error)
    emitStatus({ phase: 'error', message })
    console.error('[updater]', error)
  })

  updater.on('update-not-available', () => {
    checking = false
    pendingVersion = ''
    pendingNotes = ''
    emitStatus({ phase: 'upToDate', version: app.getVersion() })
  })

  updater.on('update-available', (info: UpdateInfoLike) => {
    void handleUpdateAvailable(info)
  })

  updater.on('download-progress', (progress: UpdateProgressEvent) => {
    const fraction = Math.min(1, Math.max(0, progress.percent / 100))
    getMainWindow()?.setProgressBar(fraction)
    emitStatus({ phase: 'downloading', percent: progress.percent })
    getMainWindow()?.webContents.send('desktop:update-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  updater.on('update-downloaded', (info: { version?: string }) => {
    checking = false
    downloading = false
    getMainWindow()?.setProgressBar(-1)
    emitStatus({ phase: 'ready', version: info.version || pendingVersion || '' })
  })
}

async function handleUpdateAvailable(info: UpdateInfoLike, releaseUrl?: string) {
  checking = false
  const version = info.version || ''
  let releaseNotes = notesFromUpdateInfo(info)
  if (!releaseNotes && version) {
    releaseNotes = await fetchGithubReleaseNotes(version)
  }
  if (!releaseNotes) {
    releaseNotes = t('update.notesUnavailable')
  }

  pendingVersion = version
  pendingNotes = releaseNotes
  pendingReleaseUrl = releaseUrl || ''
  emitStatus({
    phase: 'available',
    version,
    releaseNotes,
    ...(releaseUrl ? { releaseUrl } : {}),
  })

  // Avoid stacking duplicate prompts for the same version in one session.
  if (version && version === lastPromptedVersion) return
  lastPromptedVersion = version
  emitPrompt({
    version,
    currentVersion: app.getVersion(),
    releaseNotes,
    ...(releaseUrl ? { releaseUrl } : {}),
  })
}

async function checkForMacUpdates() {
  if (!app.isPackaged) {
    emitStatus({ phase: 'dev' })
    return { ok: false as const, reason: 'dev' as const }
  }

  if (checking) {
    emitStatus({ phase: 'checking' })
    return { ok: false as const, reason: 'busy' as const }
  }

  checking = true
  lastPromptedVersion = ''
  emitStatus({ phase: 'checking' })
  try {
    const latest = await fetchLatestGithubRelease()
    if (!latest) {
      checking = false
      emitStatus({ phase: 'error', message: t('update.errorMessage') })
      return { ok: false as const, reason: 'error' as const }
    }

    const current = app.getVersion()
    if (compareVersions(latest.version, current) <= 0) {
      checking = false
      pendingVersion = ''
      pendingNotes = ''
      pendingReleaseUrl = ''
      emitStatus({ phase: 'upToDate', version: current })
      return { ok: true as const }
    }

    let releaseNotes = latest.releaseNotes
    if (!releaseNotes) {
      releaseNotes = t('update.notesUnavailable')
    }
    await handleUpdateAvailable(
      { version: latest.version, releaseNotes },
      latest.releaseUrl
    )
    return { ok: true as const }
  } catch (error) {
    checking = false
    const message = error instanceof Error ? error.message : String(error)
    emitStatus({ phase: 'error', message })
    return { ok: false as const, reason: 'error' as const }
  }
}

async function ensureConfigured(): Promise<AutoUpdater | null> {
  const updater = await loadAutoUpdater()
  if (!updater) return null
  // Always require explicit user confirmation before downloading.
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  const token = resolveGithubToken()
  updater.setFeedURL({
    provider: 'github',
    owner: 'somertang',
    repo: 'swiftmesh',
    private: false,
    ...(token ? { token } : {}),
  })
  wireEvents(updater)
  return updater
}

export function bindUpdaterContext(options: {
  getMainWindow: () => BrowserWindow | null
  getLocale: () => Locale
}) {
  getMainWindow = options.getMainWindow
  getLocale = options.getLocale
}

export function getUpdateStatus(): UpdateStatus {
  if (!app.isPackaged && status.phase === 'idle') return { phase: 'dev' }
  return status
}

export function getAppVersion(): string {
  return app.getVersion()
}

export function setAutoUpdateEnabled(enabled: boolean) {
  if (MAC_MANUAL_UPDATE) return
  autoUpdateEnabled = enabled
  // Keep autoDownload false; downloads only start after the user confirms.
  if (autoUpdater) autoUpdater.autoDownload = false
}

/** Manual check from Preferences, or background check when auto-update is on. */
export async function checkForAppUpdates(options: { silent?: boolean } = {}) {
  void options.silent

  if (MAC_MANUAL_UPDATE) {
    return checkForMacUpdates()
  }

  if (!app.isPackaged) {
    emitStatus({ phase: 'dev' })
    return { ok: false as const, reason: 'dev' as const }
  }

  if (checking || downloading) {
    if (downloading) {
      /* leave current downloading status */
    } else {
      emitStatus({ phase: 'checking' })
    }
    return { ok: false as const, reason: 'busy' as const }
  }

  const updater = await ensureConfigured()
  if (!updater) {
    emitStatus({ phase: 'error', message: t('update.errorMessage') })
    return { ok: false as const, reason: 'error' as const }
  }

  checking = true
  lastPromptedVersion = ''
  emitStatus({ phase: 'checking' })
  updater.autoDownload = false
  try {
    await updater.checkForUpdates()
    return { ok: true as const }
  } catch (error) {
    checking = false
    const message = error instanceof Error ? error.message : String(error)
    emitStatus({ phase: 'error', message })
    return { ok: false as const, reason: 'error' as const }
  }
}

export async function downloadPendingUpdate() {
  if (MAC_MANUAL_UPDATE) {
    return { ok: false as const, reason: 'none' as const }
  }
  if (!autoUpdater || !pendingVersion) {
    return { ok: false as const, reason: 'none' as const }
  }
  if (downloading) {
    return { ok: false as const, reason: 'busy' as const }
  }
  downloading = true
  emitStatus({ phase: 'downloading', percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true as const }
  } catch (error) {
    downloading = false
    checking = false
    getMainWindow()?.setProgressBar(-1)
    const message = error instanceof Error ? error.message : String(error)
    emitStatus({ phase: 'error', message })
    return { ok: false as const, reason: 'error' as const }
  }
}

export function dismissPendingUpdate() {
  if (pendingVersion) {
    emitStatus({
      phase: 'available',
      version: pendingVersion,
      releaseNotes: pendingNotes,
      ...(pendingReleaseUrl ? { releaseUrl: pendingReleaseUrl } : {}),
    })
  } else if (status.phase === 'available') {
    /* keep */
  } else {
    emitStatus({ phase: 'idle' })
  }
  return true
}

export function quitAndInstallUpdate() {
  if (MAC_MANUAL_UPDATE) return false
  if (!autoUpdater || status.phase !== 'ready') return false
  autoUpdater.quitAndInstall(false, true)
  return true
}

export function isAutoUpdateEnabled() {
  return autoUpdateEnabled
}
