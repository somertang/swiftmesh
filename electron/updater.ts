import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { translate, type Locale, type MessageKey } from '../src/i18n/messages'
import type { UpdateProgressEvent, UpdateStatus } from '../src/desktopTypes'

type AutoUpdater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  setFeedURL: (options: Record<string, unknown>) => void
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  on: (event: string, listener: (...args: any[]) => void) => void
}

let getMainWindow: () => BrowserWindow | null = () => null
let getLocale: () => Locale = () => 'en'
let autoUpdater: AutoUpdater | null = null
let wired = false
let checking = false
let autoUpdateEnabled = true
let status: UpdateStatus = { phase: 'idle' }

function t(key: MessageKey, vars?: Record<string, string | number>) {
  return translate(getLocale(), key, vars)
}

function emitStatus(next: UpdateStatus) {
  status = next
  getMainWindow()?.webContents.send('desktop:update-status', next)
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
    getMainWindow()?.setProgressBar(-1)
    const message = error instanceof Error ? error.message : String(error)
    emitStatus({ phase: 'error', message })
    console.error('[updater]', error)
  })

  updater.on('update-not-available', () => {
    checking = false
    emitStatus({ phase: 'upToDate', version: app.getVersion() })
  })

  updater.on('update-available', (info: { version?: string }) => {
    const version = info.version || ''
    emitStatus({ phase: 'available', version })
    if (!updater.autoDownload) {
      void updater.downloadUpdate().catch((error: unknown) => {
        checking = false
        getMainWindow()?.setProgressBar(-1)
        emitStatus({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    }
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
    getMainWindow()?.setProgressBar(-1)
    emitStatus({ phase: 'ready', version: info.version || '' })
  })
}

async function ensureConfigured(): Promise<AutoUpdater | null> {
  const updater = await loadAutoUpdater()
  if (!updater) return null
  updater.autoDownload = autoUpdateEnabled
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
  autoUpdateEnabled = enabled
  if (autoUpdater) autoUpdater.autoDownload = enabled
}

/** Manual check from Preferences, or silent check when auto-update is on. */
export async function checkForAppUpdates(options: { silent?: boolean } = {}) {
  // Silent checks skip UI dialogs (none currently); reserved for future prompts.
  void options.silent

  if (!app.isPackaged) {
    emitStatus({ phase: 'dev' })
    return { ok: false as const, reason: 'dev' as const }
  }

  if (checking) {
    emitStatus({ phase: 'checking' })
    return { ok: false as const, reason: 'busy' as const }
  }

  const updater = await ensureConfigured()
  if (!updater) {
    emitStatus({ phase: 'error', message: t('update.errorMessage') })
    return { ok: false as const, reason: 'error' as const }
  }

  checking = true
  emitStatus({ phase: 'checking' })
  // Manual checks always download when an update exists.
  updater.autoDownload = true
  try {
    await updater.checkForUpdates()
    return { ok: true as const }
  } catch (error) {
    checking = false
    const message = error instanceof Error ? error.message : String(error)
    emitStatus({ phase: 'error', message })
    return { ok: false as const, reason: 'error' as const }
  } finally {
    updater.autoDownload = autoUpdateEnabled
  }
}

export function quitAndInstallUpdate() {
  if (!autoUpdater || status.phase !== 'ready') return false
  autoUpdater.quitAndInstall(false, true)
  return true
}
