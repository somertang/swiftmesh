import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  DesktopApi,
  ExportProgressEvent,
  OpenedModel,
  AppendRecordingFramePayload,
  FinishRecordingSessionPayload,
  SaveRecordingPayload,
  SaveRecordingResult,
  StartRecordingSessionPayload,
  StartRecordingSessionResult,
  UpdateProgressEvent,
  UpdatePromptEvent,
  UpdateStatus,
  WindowChromeInfo,
  WindowMenuAction,
} from '../src/desktopTypes'

const desktop: DesktopApi = {
  openModel: (): Promise<OpenedModel | null> => ipcRenderer.invoke('desktop:open-model'),

  readModelPath: (filePath: string): Promise<OpenedModel> =>
    ipcRenderer.invoke('desktop:read-model-path', filePath),

  openGlb: (): Promise<OpenedModel | null> => ipcRenderer.invoke('desktop:open-model'),

  readGlbPath: (filePath: string): Promise<OpenedModel> =>
    ipcRenderer.invoke('desktop:read-model-path', filePath),

  saveRecording: (payload: SaveRecordingPayload): Promise<SaveRecordingResult> =>
    ipcRenderer.invoke('desktop:save-recording', payload),

  startRecordingSession: (payload: StartRecordingSessionPayload): Promise<StartRecordingSessionResult> =>
    ipcRenderer.invoke('desktop:start-recording-session', payload),

  appendRecordingFrame: (payload: AppendRecordingFramePayload): Promise<void> =>
    ipcRenderer.invoke('desktop:append-recording-frame', payload),

  finishRecordingSession: (payload: FinishRecordingSessionPayload): Promise<SaveRecordingResult> =>
    ipcRenderer.invoke('desktop:finish-recording-session', payload),

  chooseRecordingOutputDir: (): Promise<string | null> =>
    ipcRenderer.invoke('desktop:choose-recording-output-dir'),

  writeRecordingManifest: (payload: {
    outputDir: string
    fileName: string
    json: string
  }): Promise<{ ok: true; path: string } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('desktop:write-recording-manifest', payload),

  chooseCacheDir: (): Promise<string | null> => ipcRenderer.invoke('desktop:choose-cache-dir'),

  setCacheDir: (dir: string): Promise<void> => ipcRenderer.invoke('desktop:set-cache-dir', dir),

  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('desktop:show-item-in-folder', filePath),

  openPath: (filePath: string): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('desktop:open-path', filePath),

  rememberRecentPath: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('desktop:remember-recent-path', filePath),

  setLocale: (locale: string): Promise<void> => ipcRenderer.invoke('desktop:set-locale', locale),

  onLocaleChanged: (handler: (locale: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, locale: string) => handler(locale)
    ipcRenderer.on('desktop:locale-changed', listener)
    return () => ipcRenderer.removeListener('desktop:locale-changed', listener)
  },

  setPreviewTheme: (theme: string): Promise<void> =>
    ipcRenderer.invoke('desktop:set-preview-theme', theme),

  onPreviewThemeChanged: (handler: (theme: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, theme: string) => handler(theme)
    ipcRenderer.on('desktop:preview-theme-changed', listener)
    return () => ipcRenderer.removeListener('desktop:preview-theme-changed', listener)
  },

  onToggleStatusBar: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on('desktop:toggle-status-bar', listener)
    return () => ipcRenderer.removeListener('desktop:toggle-status-bar', listener)
  },

  onOpenPreferences: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on('desktop:open-preferences', listener)
    return () => ipcRenderer.removeListener('desktop:open-preferences', listener)
  },

  getRecentPaths: (): Promise<string[]> => ipcRenderer.invoke('desktop:get-recent-paths'),

  setRecentMax: (max: number): Promise<string[]> =>
    ipcRenderer.invoke('desktop:set-recent-max', max),

  clearRecentPaths: (): Promise<string[]> => ipcRenderer.invoke('desktop:clear-recent-paths'),

  onRecentPathsChanged: (handler: (paths: string[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, paths: string[]) => handler(paths)
    ipcRenderer.on('desktop:recent-paths-changed', listener)
    return () => ipcRenderer.removeListener('desktop:recent-paths-changed', listener)
  },

  setWatchedModelPaths: (paths: string[]): Promise<void> =>
    ipcRenderer.invoke('desktop:set-watched-model-paths', paths),

  onModelFileChanged: (handler: (filePath: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string) => handler(filePath)
    ipcRenderer.on('desktop:model-file-changed', listener)
    return () => ipcRenderer.removeListener('desktop:model-file-changed', listener)
  },

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('desktop:get-app-version'),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('desktop:get-update-status'),

  onUpdateStatus: (handler: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => handler(status)
    ipcRenderer.on('desktop:update-status', listener)
    return () => ipcRenderer.removeListener('desktop:update-status', listener)
  },

  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('desktop:check-for-updates'),

  downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke('desktop:download-update'),

  dismissUpdate: (): Promise<void> => ipcRenderer.invoke('desktop:dismiss-update'),

  onUpdatePrompt: (handler: (event: UpdatePromptEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: UpdatePromptEvent) => handler(data)
    ipcRenderer.on('desktop:update-prompt', listener)
    return () => ipcRenderer.removeListener('desktop:update-prompt', listener)
  },

  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('desktop:install-update'),

  setAutoUpdateEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('desktop:set-auto-update-enabled', enabled),

  openExternalUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('desktop:open-external-url', url),

  onUpdateProgress: (handler: (event: UpdateProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: UpdateProgressEvent) => handler(data)
    ipcRenderer.on('desktop:update-progress', listener)
    return () => ipcRenderer.removeListener('desktop:update-progress', listener)
  },

  windowMenuAction: (action: WindowMenuAction): Promise<void> =>
    ipcRenderer.invoke('desktop:window-menu-action', action),

  getWindowChrome: (): Promise<WindowChromeInfo> => ipcRenderer.invoke('desktop:get-window-chrome'),

  openDefaultAppsSettings: (ext?: string): Promise<void> =>
    ipcRenderer.invoke('desktop:open-default-apps-settings', ext),

  takePendingOpenPaths: (): Promise<string[]> =>
    ipcRenderer.invoke('desktop:take-pending-open-paths'),

  onModelOpened: (handler: (file: OpenedModel) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, file: OpenedModel) => handler(file)
    ipcRenderer.on('desktop:model-opened', listener)
    return () => ipcRenderer.removeListener('desktop:model-opened', listener)
  },

  onGlbOpened: (handler: (file: OpenedModel) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, file: OpenedModel) => handler(file)
    ipcRenderer.on('desktop:model-opened', listener)
    return () => ipcRenderer.removeListener('desktop:model-opened', listener)
  },

  onExportProgress: (handler: (event: ExportProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ExportProgressEvent) => handler(data)
    ipcRenderer.on('export-progress', listener)
    return () => ipcRenderer.removeListener('export-progress', listener)
  },

  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
}

contextBridge.exposeInMainWorld('desktop', desktop)
