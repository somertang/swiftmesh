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
/** Top-level capture mode: video encode vs image sequence/atlas. */
export type RecordingMode = 'video' | 'images'
/** Encode profile for final video / capture supersampling. */
export type RecordingQuality = 'standard' | 'high' | 'maxCompatible'

export type RecordingImageFormat = 'png' | 'jpeg' | 'webp'
export type RecordingSequencePackage = 'folder' | 'zip'
/** How to pack spritesheet atlases when frames exceed max edge. */
export type AtlasPackMode = 'preserve' | 'fitSingle'
/** JPEG + no scene background: solid fill, or solid fill plus grayscale mask. */
export type JpegNoBgMode = 'mask' | 'solid'

export type RecordingImagesOptions = {
  exportSequence: boolean
  exportAtlas: boolean
  /** When false: export transparent frames (PNG/WebP) and flatten to background for JPEG. */
  exportBackground: boolean
  /** JPEG + no background. Default solid. */
  jpegNoBgMode?: JpegNoBgMode
  /** JPEG flatten fill when exportBackground is false. Default #a0a0a0. */
  imageFlattenColor?: string
  imageFormat: RecordingImageFormat
  /** 1–100; ignored for PNG. */
  imageQuality: number
  sequencePackage: RecordingSequencePackage
  /** Used when exportAtlas is true. Default preserve. */
  atlasPackMode?: AtlasPackMode
  /** Atlas sheet max edge in px. Default 8192. */
  atlasMaxEdge?: number
}

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

/** Session export kind sent over IPC (video containers or images). */
export type RecordingSessionFormat = RecordingExportFormat | 'images'

export type StartRecordingSessionPayload = {
  defaultName: string
  format: RecordingSessionFormat
  quality: RecordingQuality
  fps: number
  /** Required when format is `images`. */
  images?: RecordingImagesOptions
}

export type StartRecordingSessionResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: string }

export type AppendRecordingFramePayload = {
  sessionId: string
  index: number
  /** PNG bytes */
  data: ArrayBuffer
  /** Grayscale mask PNG bytes (JPEG + no background export). */
  maskData?: ArrayBuffer
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
  | 'openUserGuide'

export type UpdateProgressEvent = {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'dev' }
  | { phase: 'checking' }
  | { phase: 'upToDate'; version: string }
  | { phase: 'available'; version: string; releaseNotes?: string; releaseUrl?: string }
  | { phase: 'downloading'; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }

export type UpdatePromptEvent = {
  version: string
  currentVersion: string
  releaseNotes: string
  /** When set, the user should open this URL to download manually (macOS). */
  releaseUrl?: string
}

export type WindowChromePlatform = 'win32' | 'darwin' | 'linux'

export type WindowChromeInfo = {
  platform: WindowChromePlatform
  /** Left safe area for macOS traffic lights (0 on other platforms). */
  controlsInsetLeft: number
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
  /**
   * One Save As for images export: returns folder + filename stem, or null if canceled.
   * When `outputDir` is a writable folder, writes there silently.
   */
  pickImagesOutputBase: (payload: {
    defaultName: string
    outputDir?: string
  }) => Promise<{ dir: string; stem: string } | null>
  /** Write a JSON manifest next to recording outputs (narrow write API). */
  writeRecordingManifest: (payload: {
    outputDir: string
    fileName: string
    json: string
  }) => Promise<{ ok: true; path: string } | { ok: false; reason: string }>
  /** Pick a folder for cache / temporary files (null if canceled). */
  chooseCacheDir: () => Promise<string | null>
  /** Sync preferred cache root to the main process (empty = OS temp). */
  setCacheDir: (dir: string) => Promise<void>
  showItemInFolder: (filePath: string) => Promise<void>
  /** Open a local file with the OS default application (e.g. video player). */
  openPath: (filePath: string) => Promise<{ ok: true } | { ok: false; reason: string }>
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
  /** Persist Open Recent max length and trim the stored list. */
  setRecentMax: (max: number) => Promise<string[]>
  clearRecentPaths: () => Promise<string[]>
  onRecentPathsChanged: (handler: (paths: string[]) => void) => () => void
  /** Replace the set of absolute model paths watched for auto-reload. */
  setWatchedModelPaths: (paths: string[]) => Promise<void>
  /** Fired when a watched model file changes on disk. */
  onModelFileChanged: (handler: (filePath: string) => void) => () => void
  /** Current app version from the main process. */
  getAppVersion: () => Promise<string>
  /** Latest known update status. */
  getUpdateStatus: () => Promise<UpdateStatus>
  /** Subscribe to update status changes (Preferences UI). */
  onUpdateStatus: (handler: (status: UpdateStatus) => void) => () => void
  /** Manual update check from Preferences. */
  checkForUpdates: () => Promise<void>
  /** Download a pending update after the user confirms. */
  downloadUpdate: () => Promise<boolean>
  /** Dismiss the update confirmation (Later). */
  dismissUpdate: () => Promise<void>
  /** Fired when an update is available and needs user confirmation. */
  onUpdatePrompt: (handler: (event: UpdatePromptEvent) => void) => () => void
  /** Quit and install a downloaded update. */
  installUpdate: () => Promise<boolean>
  /** Sync auto-update preference to the main process. */
  setAutoUpdateEnabled: (enabled: boolean) => Promise<void>
  /** Download progress while an update is being fetched. */
  onUpdateProgress: (handler: (event: UpdateProgressEvent) => void) => () => void
  /** Open an https URL in the system browser. */
  openExternalUrl: (url: string) => Promise<void>
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
