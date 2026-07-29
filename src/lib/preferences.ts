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
  secondsPerRevolution: number
  recordingExportFormat: RecordingExportFormat
  recordingQuality: RecordingQuality
  recordingSizeId: string
  /** Absolute directory for silent save after recording; empty = prompt Save As. */
  outputDir: string
}

export type AppPreferences = {
  recording: RecordingPreferences
  lighting: LightingSettings
  uiTheme: UiTheme
}

export const DEFAULT_RECORDING_PREFERENCES: RecordingPreferences = {
  secondsPerRevolution: 8,
  recordingExportFormat: 'mp4',
  recordingQuality: 'high',
  recordingSizeId: 'viewport',
  outputDir: '',
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
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

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function normalizePreferences(raw: unknown): AppPreferences {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const recordingRaw =
    obj.recording && typeof obj.recording === 'object'
      ? (obj.recording as Record<string, unknown>)
      : {}
  const lightingRaw =
    obj.lighting && typeof obj.lighting === 'object'
      ? (obj.lighting as Record<string, unknown>)
      : {}

  return {
    recording: {
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
  recording?: Partial<RecordingPreferences>
  lighting?: Partial<LightingSettings>
  uiTheme?: UiTheme
}): AppPreferences {
  const current = readPreferences()
  return writePreferences({
    recording: { ...current.recording, ...patch.recording },
    lighting: { ...current.lighting, ...patch.lighting },
    uiTheme: patch.uiTheme ?? current.uiTheme,
  })
}
