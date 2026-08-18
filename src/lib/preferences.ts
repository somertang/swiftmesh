import { DEFAULT_LIGHTING, type LightingSettings } from '../config/lightingDefaults'
import { isRecordProjection, type RecordProjection } from '../config/cameraDefaults'
import type {
  AtlasPackMode,
  JpegNoBgMode,
  RecordingExportFormat,
  RecordingImageFormat,
  RecordingMode,
  RecordingQuality,
  RecordingSequencePackage,
} from '../desktopTypes'
import { ATLAS_MAX_EDGE_DEFAULT, clampAtlasMaxEdge } from './atlasLayout'
import { DEFAULT_PITCH_ANGLES } from './multiAxisManifest'
import {
  DEFAULT_FLATTEN_COLOR,
  isAtlasPackMode,
  isJpegNoBgMode,
  isRecordingImageFormat,
  isRecordingSequencePackage,
  isVideoExportFormat,
  normalizeFlattenColor,
  normalizeRecordingQuality,
} from './recordingPresets'
import {
  DEFAULT_UI_THEME,
  isUiTheme,
  writeStoredUiTheme,
  type UiTheme,
} from './uiTheme'

export const PREFERENCES_STORAGE_KEY = 'swiftmesh.preferences'

export type RecordingPreferences = {
  /** When false, hide viewport record controls. Default true. */
  enabled: boolean
  /** Default mode for new tabs / FAB quick-record. */
  recordingMode: RecordingMode

  /** Video: container format. */
  videoExportFormat: RecordingExportFormat
  videoSizeId: string
  videoQuality: RecordingQuality
  secondsPerRevolution: number
  recordingFps: number
  /** Absolute dir for silent video save; empty = prompt Save As. */
  videoOutputDir: string

  /** Images: outputs and encoding. */
  exportSequence: boolean
  exportAtlas: boolean
  /**
   * When false: remove background layers from exports.
   * - Images (PNG/WebP): keep transparency (alpha).
   * - Images (JPEG): solid fill and/or mask, per jpegNoBgMode.
   * - Video: flatten to videoFlattenColor.
   */
  exportBackground: boolean
  /** JPEG + no background. Default solid. */
  jpegNoBgMode: JpegNoBgMode
  /** JPEG flatten fill when exportBackground is false. */
  imageFlattenColor: string
  /** Video flatten fill when exportBackground is false. */
  videoFlattenColor: string
  /** When packing atlas: preserve multi-sheet or force one scaled sheet. */
  atlasPackMode: AtlasPackMode
  /** Max atlas sheet edge (px). Default 8192. */
  atlasMaxEdge: number
  imageFormat: RecordingImageFormat
  /** 1–100; ignored for PNG. */
  imageQuality: number
  sequencePackage: RecordingSequencePackage
  imageSizeId: string
  /** Used when imageSizeId / videoSizeId is `custom`. */
  imageCustomWidth: number
  imageCustomHeight: number
  videoCustomWidth: number
  videoCustomHeight: number
  /** Capture supersampling profile for image mode. */
  imageCaptureQuality: RecordingQuality
  frameCount: number
  /** Absolute dir for silent image/atlas save; empty = prompt Save As. */
  imageOutputDir: string
  /** Images: capture multiple pitch elevations in one run. */
  multiAxisEnabled: boolean
  /** Pitch angles in degrees (horizon = 0). */
  pitchAngles: number[]
  /** Camera projection used when recording. `viewport` follows the live view. */
  recordProjection: RecordProjection
}

export type StartupBehavior = 'blank' | 'restoreSession' | 'openRecent'

export type GeneralPreferences = {
  startupBehavior: StartupBehavior
  /** Max entries in Open Recent (5–30). */
  recentFilesMax: number
  /** Whether the viewport info HUD is shown for new windows / after restore. */
  statusBarVisible: boolean
  /** Confirm before closing tabs that have a loaded model. */
  confirmCloseTabs: boolean
  /** Packaged app: check/download updates in the background. */
  autoUpdate: boolean
}

/** 0 = no app-side limit (GPU max applies). */
export type MaxTextureSizeOption = 0 | 2048 | 4096 | 8192

export const MAX_TEXTURE_SIZE_OPTIONS: MaxTextureSizeOption[] = [0, 2048, 4096, 8192]

export type PerformancePreferences = {
  /** WebGL context antialias / MSAA. Changing remounts the viewport. */
  msaa: boolean
  /** Cap loaded texture edge length; 0 = automatic (no app limit). */
  maxTextureSize: MaxTextureSizeOption
  /**
   * Heuristically scale display clones when authored units look like cm/mm
   * (or tiny models). Off keeps file units as world units.
   */
  autoNormalizeUnits: boolean
  /** Reload tabs when their absolute model file changes on disk (desktop). */
  autoReloadOnChange: boolean
  /** Absolute dir for encode/temp files; empty = OS temp directory. */
  cacheDir: string
  /** Preference only — no telemetry is collected yet. */
  telemetryEnabled: boolean
}

export type AppPreferences = {
  general: GeneralPreferences
  performance: PerformancePreferences
  recording: RecordingPreferences
  lighting: LightingSettings
  uiTheme: UiTheme
}

export const DEFAULT_RECORDING_PREFERENCES: RecordingPreferences = {
  enabled: true,
  recordingMode: 'video',
  videoExportFormat: 'mp4',
  videoSizeId: 'viewport',
  videoQuality: 'high',
  secondsPerRevolution: 8,
  recordingFps: 30,
  videoOutputDir: '',
  exportSequence: true,
  exportAtlas: true,
  exportBackground: true,
  jpegNoBgMode: 'solid',
  imageFlattenColor: DEFAULT_FLATTEN_COLOR,
  videoFlattenColor: DEFAULT_FLATTEN_COLOR,
  atlasPackMode: 'preserve',
  atlasMaxEdge: ATLAS_MAX_EDGE_DEFAULT,
  imageFormat: 'png',
  imageQuality: 92,
  sequencePackage: 'folder',
  imageSizeId: 'viewport',
  imageCustomWidth: 1280,
  imageCustomHeight: 720,
  videoCustomWidth: 1920,
  videoCustomHeight: 1080,
  imageCaptureQuality: 'high',
  frameCount: 36,
  imageOutputDir: '',
  multiAxisEnabled: false,
  pitchAngles: [...DEFAULT_PITCH_ANGLES],
  recordProjection: 'viewport',
}

export function cloneRecordingPreferences(prefs: RecordingPreferences): RecordingPreferences {
  return { ...prefs, pitchAngles: [...prefs.pitchAngles] }
}

export const RECENT_FILES_MAX_MIN = 5
export const RECENT_FILES_MAX_MAX = 30
export const DEFAULT_RECENT_FILES_MAX = 10

export const DEFAULT_GENERAL_PREFERENCES: GeneralPreferences = {
  startupBehavior: 'blank',
  recentFilesMax: DEFAULT_RECENT_FILES_MAX,
  statusBarVisible: false,
  confirmCloseTabs: false,
  autoUpdate: true,
}

export const DEFAULT_PERFORMANCE_PREFERENCES: PerformancePreferences = {
  msaa: true,
  maxTextureSize: 0,
  autoNormalizeUnits: true,
  autoReloadOnChange: false,
  cacheDir: '',
  telemetryEnabled: false,
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  general: { ...DEFAULT_GENERAL_PREFERENCES },
  performance: { ...DEFAULT_PERFORMANCE_PREFERENCES },
  recording: { ...DEFAULT_RECORDING_PREFERENCES },
  lighting: { ...DEFAULT_LIGHTING },
  uiTheme: DEFAULT_UI_THEME,
}

function isRecordingMode(value: unknown): value is RecordingMode {
  return value === 'video' || value === 'images'
}

function isLightingMode(value: unknown): value is LightingSettings['mode'] {
  return (
    value === 'studio' || value === 'classic' || value === 'neutral' || value === 'rendered'
  )
}

function isStartupBehavior(value: unknown): value is StartupBehavior {
  return value === 'blank' || value === 'restoreSession' || value === 'openRecent'
}

function isMaxTextureSize(value: unknown): value is MaxTextureSizeOption {
  return value === 0 || value === 2048 || value === 4096 || value === 8192
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizePitchAngles(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [...DEFAULT_RECORDING_PREFERENCES.pitchAngles]
  }
  const angles: number[] = []
  for (const item of value) {
    const n = typeof item === 'number' ? item : Number(item)
    if (!Number.isFinite(n)) continue
    angles.push(Math.max(-89, Math.min(89, n)))
  }
  return angles.length > 0 ? angles : [...DEFAULT_RECORDING_PREFERENCES.pitchAngles]
}

export function normalizePreferences(raw: unknown): AppPreferences {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const generalRaw =
    obj.general && typeof obj.general === 'object'
      ? (obj.general as Record<string, unknown>)
      : {}
  const performanceRaw =
    obj.performance && typeof obj.performance === 'object'
      ? (obj.performance as Record<string, unknown>)
      : {}
  const recordingRaw =
    obj.recording && typeof obj.recording === 'object'
      ? (obj.recording as Record<string, unknown>)
      : {}
  const lightingRaw =
    obj.lighting && typeof obj.lighting === 'object'
      ? (obj.lighting as Record<string, unknown>)
      : {}

  let exportSequence =
    recordingRaw.exportSequence === undefined
      ? DEFAULT_RECORDING_PREFERENCES.exportSequence
      : recordingRaw.exportSequence !== false
  const exportAtlas =
    recordingRaw.exportAtlas === undefined
      ? DEFAULT_RECORDING_PREFERENCES.exportAtlas
      : recordingRaw.exportAtlas !== false
  if (!exportSequence && !exportAtlas) exportSequence = true

  const exportBackground =
    recordingRaw.exportBackground === undefined
      ? DEFAULT_RECORDING_PREFERENCES.exportBackground
      : recordingRaw.exportBackground !== false

  const legacyFormat = recordingRaw.recordingExportFormat
  const legacySize =
    typeof recordingRaw.recordingSizeId === 'string' && recordingRaw.recordingSizeId
      ? recordingRaw.recordingSizeId
      : null
  const legacyQuality = normalizeRecordingQuality(recordingRaw.recordingQuality)

  let recordingMode: RecordingMode = DEFAULT_RECORDING_PREFERENCES.recordingMode
  if (isRecordingMode(recordingRaw.recordingMode)) {
    recordingMode = recordingRaw.recordingMode
  } else if (legacyFormat === 'images') {
    recordingMode = 'images'
  }

  let videoExportFormat: RecordingExportFormat = DEFAULT_RECORDING_PREFERENCES.videoExportFormat
  if (isVideoExportFormat(recordingRaw.videoExportFormat)) {
    videoExportFormat = recordingRaw.videoExportFormat
  } else if (isVideoExportFormat(legacyFormat)) {
    videoExportFormat = legacyFormat
  }

  const videoSizeId =
    typeof recordingRaw.videoSizeId === 'string' && recordingRaw.videoSizeId
      ? recordingRaw.videoSizeId
      : (legacySize ?? DEFAULT_RECORDING_PREFERENCES.videoSizeId)
  const imageSizeId =
    typeof recordingRaw.imageSizeId === 'string' && recordingRaw.imageSizeId
      ? recordingRaw.imageSizeId
      : (legacySize ?? DEFAULT_RECORDING_PREFERENCES.imageSizeId)

  const videoQuality =
    recordingRaw.videoQuality !== undefined
      ? normalizeRecordingQuality(recordingRaw.videoQuality)
      : legacyQuality
  const imageCaptureQuality =
    recordingRaw.imageCaptureQuality !== undefined
      ? normalizeRecordingQuality(recordingRaw.imageCaptureQuality)
      : legacyQuality

  return {
    general: {
      startupBehavior: isStartupBehavior(generalRaw.startupBehavior)
        ? generalRaw.startupBehavior
        : DEFAULT_GENERAL_PREFERENCES.startupBehavior,
      recentFilesMax: Math.round(
        clampNumber(
          generalRaw.recentFilesMax,
          DEFAULT_GENERAL_PREFERENCES.recentFilesMax,
          RECENT_FILES_MAX_MIN,
          RECENT_FILES_MAX_MAX
        )
      ),
      statusBarVisible: generalRaw.statusBarVisible === true,
      confirmCloseTabs: generalRaw.confirmCloseTabs === true,
      autoUpdate:
        generalRaw.autoUpdate !== undefined
          ? generalRaw.autoUpdate !== false
          : generalRaw.checkUpdatesOnStartup !== false,
    },
    performance: {
      msaa: performanceRaw.msaa !== false,
      maxTextureSize: isMaxTextureSize(performanceRaw.maxTextureSize)
        ? performanceRaw.maxTextureSize
        : DEFAULT_PERFORMANCE_PREFERENCES.maxTextureSize,
      autoNormalizeUnits: performanceRaw.autoNormalizeUnits !== false,
      autoReloadOnChange: performanceRaw.autoReloadOnChange === true,
      cacheDir:
        typeof performanceRaw.cacheDir === 'string' ? performanceRaw.cacheDir.trim() : '',
      telemetryEnabled: performanceRaw.telemetryEnabled === true,
    },
    recording: {
      enabled: recordingRaw.enabled !== false,
      recordingMode,
      videoExportFormat,
      videoSizeId,
      videoQuality,
      secondsPerRevolution: clampNumber(
        recordingRaw.secondsPerRevolution,
        DEFAULT_RECORDING_PREFERENCES.secondsPerRevolution,
        3,
        60
      ),
      recordingFps: Math.round(
        clampNumber(recordingRaw.recordingFps, DEFAULT_RECORDING_PREFERENCES.recordingFps, 1, 120)
      ),
      videoOutputDir:
        typeof recordingRaw.videoOutputDir === 'string'
          ? recordingRaw.videoOutputDir.trim()
          : typeof recordingRaw.outputDir === 'string'
            ? recordingRaw.outputDir.trim()
            : '',
      exportSequence,
      exportAtlas,
      exportBackground,
      jpegNoBgMode: isJpegNoBgMode(recordingRaw.jpegNoBgMode)
        ? recordingRaw.jpegNoBgMode
        : DEFAULT_RECORDING_PREFERENCES.jpegNoBgMode,
      imageFlattenColor: normalizeFlattenColor(
        recordingRaw.imageFlattenColor,
        DEFAULT_RECORDING_PREFERENCES.imageFlattenColor
      ),
      videoFlattenColor: normalizeFlattenColor(
        recordingRaw.videoFlattenColor,
        DEFAULT_RECORDING_PREFERENCES.videoFlattenColor
      ),
      atlasPackMode: isAtlasPackMode(recordingRaw.atlasPackMode)
        ? recordingRaw.atlasPackMode
        : DEFAULT_RECORDING_PREFERENCES.atlasPackMode,
      atlasMaxEdge: clampAtlasMaxEdge(
        recordingRaw.atlasMaxEdge,
        DEFAULT_RECORDING_PREFERENCES.atlasMaxEdge
      ),
      imageFormat: isRecordingImageFormat(recordingRaw.imageFormat)
        ? recordingRaw.imageFormat
        : DEFAULT_RECORDING_PREFERENCES.imageFormat,
      imageQuality: Math.round(
        clampNumber(
          recordingRaw.imageQuality,
          DEFAULT_RECORDING_PREFERENCES.imageQuality,
          1,
          100
        )
      ),
      sequencePackage: isRecordingSequencePackage(recordingRaw.sequencePackage)
        ? recordingRaw.sequencePackage
        : DEFAULT_RECORDING_PREFERENCES.sequencePackage,
      imageSizeId,
      imageCustomWidth: Math.round(
        clampNumber(
          recordingRaw.imageCustomWidth,
          DEFAULT_RECORDING_PREFERENCES.imageCustomWidth,
          2,
          8192
        )
      ),
      imageCustomHeight: Math.round(
        clampNumber(
          recordingRaw.imageCustomHeight,
          DEFAULT_RECORDING_PREFERENCES.imageCustomHeight,
          2,
          8192
        )
      ),
      videoCustomWidth: Math.round(
        clampNumber(
          recordingRaw.videoCustomWidth,
          DEFAULT_RECORDING_PREFERENCES.videoCustomWidth,
          2,
          8192
        )
      ),
      videoCustomHeight: Math.round(
        clampNumber(
          recordingRaw.videoCustomHeight,
          DEFAULT_RECORDING_PREFERENCES.videoCustomHeight,
          2,
          8192
        )
      ),
      imageCaptureQuality,
      frameCount: Math.round(
        clampNumber(recordingRaw.frameCount, DEFAULT_RECORDING_PREFERENCES.frameCount, 1, 720)
      ),
      imageOutputDir:
        typeof recordingRaw.imageOutputDir === 'string' ? recordingRaw.imageOutputDir.trim() : '',
      multiAxisEnabled: recordingRaw.multiAxisEnabled === true,
      pitchAngles: normalizePitchAngles(recordingRaw.pitchAngles),
      recordProjection: isRecordProjection(recordingRaw.recordProjection)
        ? recordingRaw.recordProjection
        : DEFAULT_RECORDING_PREFERENCES.recordProjection,
    },
    lighting: {
      mode: isLightingMode(lightingRaw.mode) ? lightingRaw.mode : DEFAULT_LIGHTING.mode,
      exposure: clampNumber(lightingRaw.exposure, DEFAULT_LIGHTING.exposure, 0.1, 3),
      envIntensity: clampNumber(lightingRaw.envIntensity, DEFAULT_LIGHTING.envIntensity, 0, 3),
    },
    uiTheme: isUiTheme(obj.uiTheme) ? obj.uiTheme : DEFAULT_UI_THEME,
  }
}

export function readPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_APP_PREFERENCES)
    return normalizePreferences(JSON.parse(raw))
  } catch {
    return structuredClone(DEFAULT_APP_PREFERENCES)
  }
}

export function writePreferences(prefs: AppPreferences) {
  const normalized = normalizePreferences(prefs)
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* ignore */
  }
  if (isUiTheme(normalized.uiTheme)) writeStoredUiTheme(normalized.uiTheme)
  return normalized
}

export function patchPreferences(patch: {
  general?: Partial<GeneralPreferences>
  performance?: Partial<PerformancePreferences>
  recording?: Partial<RecordingPreferences>
  lighting?: Partial<LightingSettings>
  uiTheme?: UiTheme
}): AppPreferences {
  const current = readPreferences()
  return writePreferences({
    general: { ...current.general, ...patch.general },
    performance: { ...current.performance, ...patch.performance },
    recording: { ...current.recording, ...patch.recording },
    lighting: { ...current.lighting, ...patch.lighting },
    uiTheme: patch.uiTheme ?? current.uiTheme,
  })
}

/** Reset app preferences to defaults. Locale is stored separately and is not touched. */
export function resetPreferences(): AppPreferences {
  return writePreferences(structuredClone(DEFAULT_APP_PREFERENCES))
}
