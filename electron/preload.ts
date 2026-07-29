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

  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('desktop:show-item-in-folder', filePath),

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

  clearRecentPaths: (): Promise<string[]> => ipcRenderer.invoke('desktop:clear-recent-paths'),

  onRecentPathsChanged: (handler: (paths: string[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, paths: string[]) => handler(paths)
    ipcRenderer.on('desktop:recent-paths-changed', listener)
    return () => ipcRenderer.removeListener('desktop:recent-paths-changed', listener)
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
