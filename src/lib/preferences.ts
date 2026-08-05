import { DEFAULT_LIGHTING, type LightingSettings } from '../config/lightingDefaults'
import type { RecordingExportFormat, RecordingQuality } from '../desktopTypes'
import { normalizeRecordingQuality } from './recordingPresets'
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
  secondsPerRevolution: number
  recordingExportFormat: RecordingExportFormat
  recordingQuality: RecordingQuality
  recordingSizeId: string
  /** Absolute directory for silent save after recording; empty = prompt Save As. */
  outputDir: string
}

export type StartupBehavior = 'blank' | 'restoreSession' | 'openRecent'

export type GeneralPreferences = {
  startupBehavior: StartupBehavior
  /** Max entries in Open Recent (5–30). */
  recentFilesMax: number
  /** Whether the status bar is shown for new windows / after restore. */
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
  secondsPerRevolution: 8,
  recordingExportFormat: 'mp4',
  recordingQuality: 'high',
  recordingSizeId: 'viewport',
  outputDir: '',
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

function isExportFormat(value: unknown): value is RecordingExportFormat {
  return value === 'mp4' || value === 'webm' || value === 'both'
}

function isLightingMode(value: unknown): value is LightingSettings['mode'] {
  return value === 'studio' || value === 'classic' || value === 'neutral'
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
      secondsPerRevolution: clampNumber(
        recordingRaw.secondsPerRevolution,
        DEFAULT_RECORDING_PREFERENCES.secondsPerRevolution,
        3,
        60
      ),
      recordingExportFormat: isExportFormat(recordingRaw.recordingExportFormat)
        ? recordingRaw.recordingExportFormat
        : DEFAULT_RECORDING_PREFERENCES.recordingExportFormat,
      recordingQuality: normalizeRecordingQuality(recordingRaw.recordingQuality),
      recordingSizeId:
        typeof recordingRaw.recordingSizeId === 'string' && recordingRaw.recordingSizeId
          ? recordingRaw.recordingSizeId
          : DEFAULT_RECORDING_PREFERENCES.recordingSizeId,
      outputDir:
        typeof recordingRaw.outputDir === 'string' ? recordingRaw.outputDir.trim() : '',
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
