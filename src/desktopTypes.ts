export type ModelFormat = 'glb' | 'gltf' | 'obj'

export type OpenedModelCompanion = {
  relativePath: string
  data: ArrayBuffer
}

export type OpenedModel = {
  name: string
  path: string
  data: ArrayBuffer
  format: ModelFormat
  companions?: OpenedModelCompanion[]
}

/** @deprecated Use OpenedModel */
export type OpenedGlb = OpenedModel

export type RecordingExportFormat = 'mp4' | 'webm' | 'both'
/** Encode profile for final video (frames are always lossless PNG). */
export type RecordingQuality = 'standard' | 'high' | 'lossless'

export type SaveRecordingPayload = {
  defaultName: string
  data: ArrayBuffer
  format: RecordingExportFormat
  quality: RecordingQuality
  /** Absolute directory for silent save; empty / omitted → Save As. */
  outputDir?: string
}

export type SaveRecordingResult =
  | { ok: true; path: string; paths: string[] }
  | { ok: false; reason: string }

export type StartRecordingSessionPayload = {
  defaultName: string
  format: RecordingExportFormat
  quality: RecordingQuality
  fps: number
}

export type StartRecordingSessionResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: string }

export type AppendRecordingFramePayload = {
  sessionId: string
  index: number
  /** PNG bytes */
  data: ArrayBuffer
}

export type FinishRecordingSessionPayload = {
  sessionId: string
  frameCount: number
  /** Overrides the output FPS used for ffmpeg (useful when capture FPS lags). */
  fps: number
  /**
   * Absolute directory for silent save. Empty / omitted → Save As dialog.
   * If set but invalid, main process warns and falls back to Save As.
   */
  outputDir?: string
}

export type ExportProgressEvent = {
  stage: string
  percent: number
}

export type WindowMenuAction =
  | 'quit'
  | 'reload'
  | 'toggleDevTools'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleFullscreen'
  | 'showAbout'

export type WindowChromeInfo = {
  titleBarOverlay: boolean
  overlayHeight: number
  isPackaged: boolean
}

export type DesktopApi = {
  openModel: () => Promise<OpenedModel | null>
  readModelPath: (filePath: string) => Promise<OpenedModel>
  /** @deprecated Use openModel */
  openGlb: () => Promise<OpenedModel | null>
  /** @deprecated Use readModelPath */
  readGlbPath: (filePath: string) => Promise<OpenedModel>
  saveRecording: (payload: SaveRecordingPayload) => Promise<SaveRecordingResult>
  startRecordingSession: (payload: StartRecordingSessionPayload) => Promise<StartRecordingSessionResult>
  appendRecordingFrame: (payload: AppendRecordingFramePayload) => Promise<void>
  finishRecordingSession: (
    payload: FinishRecordingSessionPayload
  ) => Promise<SaveRecordingResult>
  /** Pick a folder for default recording output (null if canceled). */
  chooseRecordingOutputDir: () => Promise<string | null>
  showItemInFolder: (filePath: string) => Promise<void>
  /** Record an absolute local path in File → Open Recent (no-op if not absolute). */
  rememberRecentPath: (filePath: string) => Promise<void>
  /** Sync UI locale to the application menu (en | zh). */
  setLocale: (locale: string) => Promise<void>
  /** Fired when the user picks a language from the application menu. */
  onLocaleChanged: (handler: (locale: string) => void) => () => void
  /** Sync model preview theme to the application menu (simple | professional). */
  setPreviewTheme: (theme: string) => Promise<void>
  /** Fired when the user picks a model theme from the application menu. */
  onPreviewThemeChanged: (handler: (theme: string) => void) => () => void
  /** Fired when View → Toggle Status Bar (or Ctrl/Cmd+B) is chosen. */
  onToggleStatusBar: (handler: () => void) => () => void
  /** Fired when Preferences… is chosen (legacy menu / IPC). */
  onOpenPreferences: (handler: () => void) => () => void
  /** Recent model absolute paths for the custom File menu. */
  getRecentPaths: () => Promise<string[]>
  clearRecentPaths: () => Promise<string[]>
  onRecentPathsChanged: (handler: (paths: string[]) => void) => () => void
  /** Run a window/menu action that lives in the main process. */
  windowMenuAction: (action: WindowMenuAction) => Promise<void>
  getWindowChrome: () => Promise<WindowChromeInfo>
  /** Open Windows Default Apps settings (optional extension hint). */
  openDefaultAppsSettings: (ext?: string) => Promise<void>
  /**
   * Claim file paths passed via OS "Open with" / argv on cold start.
   * Call after the renderer has subscribed to model-open handlers.
   */
  takePendingOpenPaths: () => Promise<string[]>
  onModelOpened: (handler: (file: OpenedModel) => void) => () => void
  /** @deprecated Use onModelOpened */
  onGlbOpened: (handler: (file: OpenedModel) => void) => () => void
  onExportProgress: (handler: (event: ExportProgressEvent) => void) => () => void
  getPathForFile: (file: File) => string
}
