/** H.264/yuv420p requires even width and height. */
import type {
  AtlasPackMode,
  JpegNoBgMode,
  RecordingExportFormat,
  RecordingImageFormat,
  RecordingMode,
  RecordingQuality,
  RecordingSequencePackage,
} from '../desktopTypes'

export function toEvenDimension(value: number): number {
  const even = value & ~1
  return even > 0 ? even : 2
}

export const RECORDING_FPS_OPTIONS = [24, 30, 60] as const

export const RECORDING_MODE_OPTIONS = [
  { value: 'video' as const, label: 'Video' },
  { value: 'images' as const, label: 'Images' },
]

export const RECORDING_IMAGE_FORMAT_OPTIONS = [
  { value: 'png' as const, label: 'PNG' },
  { value: 'jpeg' as const, label: 'JPEG' },
  { value: 'webp' as const, label: 'WebP' },
]

export const RECORDING_SEQUENCE_PACKAGE_OPTIONS = [
  { value: 'folder' as const, label: 'Folder' },
  { value: 'zip' as const, label: 'ZIP' },
]

export const ATLAS_PACK_MODE_OPTIONS = [
  { value: 'preserve' as const, label: 'Preserve' },
  { value: 'fitSingle' as const, label: 'Fit single' },
]

export function isRecordingMode(value: unknown): value is RecordingMode {
  return value === 'video' || value === 'images'
}

export function isRecordingImageFormat(value: unknown): value is RecordingImageFormat {
  return value === 'png' || value === 'jpeg' || value === 'webp'
}

export function isRecordingSequencePackage(value: unknown): value is RecordingSequencePackage {
  return value === 'folder' || value === 'zip'
}

export function isAtlasPackMode(value: unknown): value is AtlasPackMode {
  return value === 'preserve' || value === 'fitSingle'
}

export function imageExtension(format: RecordingImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format
}

export const DEFAULT_FLATTEN_COLOR = '#a0a0a0'

export const JPEG_NO_BG_MODE_OPTIONS = [
  { value: 'solid' as const },
  { value: 'mask' as const },
]

export function isJpegNoBgMode(value: unknown): value is JpegNoBgMode {
  return value === 'mask' || value === 'solid'
}

/** Parse #rgb / #rrggbb / rgb hex to lowercase #rrggbb, or null if invalid. */
export function parseFlattenColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.toLowerCase().split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

/** Normalize #rgb / #rrggbb / rgb hex to lowercase #rrggbb. */
export function normalizeFlattenColor(
  value: unknown,
  fallback = DEFAULT_FLATTEN_COLOR
): string {
  return parseFlattenColor(value) ?? fallback
}

export function flattenColorToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeFlattenColor(hex)
  const v = n.slice(1)
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

/** JPEG + no background + mask mode → companion grayscale mask PNGs. */
export function needsExportMask(options: {
  imageFormat: RecordingImageFormat
  exportBackground: boolean
  jpegNoBgMode?: JpegNoBgMode
}): boolean {
  return (
    options.imageFormat === 'jpeg' &&
    !options.exportBackground &&
    (options.jpegNoBgMode ?? 'solid') === 'mask'
  )
}

export type RecordingSizePreset = {
  id: string
  label: string
  /** When null, use the current WebGL canvas size (even-aligned). */
  width: number | null
  height: number | null
}

export const RECORDING_SIZE_PRESETS: RecordingSizePreset[] = [
  { id: 'viewport', label: 'Viewport (current)', width: null, height: null },
  { id: 'custom', label: 'Custom…', width: null, height: null },
  { id: 'pc-1080p', label: 'PC · 1920 × 1080', width: 1920, height: 1080 },
  { id: 'pc-720p', label: 'PC · 1280 × 720', width: 1280, height: 720 },
  { id: 'pc-1440p', label: 'PC · 2560 × 1440', width: 2560, height: 1440 },
  { id: 'pc-4k', label: 'PC · 3840 × 2160 (4K)', width: 3840, height: 2160 },
  { id: 'mobile-1080x1920', label: 'Mobile · 1080 × 1920 (9:16)', width: 1080, height: 1920 },
  { id: 'mobile-1080x2340', label: 'Mobile · 1080 × 2340', width: 1080, height: 2340 },
  { id: 'mobile-1170x2532', label: 'Mobile · 1170 × 2532', width: 1170, height: 2532 },
  { id: 'mobile-720x1280', label: 'Mobile · 720 × 1280', width: 720, height: 1280 },
]

export function getRecordingSizePreset(id: string): RecordingSizePreset {
  return RECORDING_SIZE_PRESETS.find(p => p.id === id) ?? RECORDING_SIZE_PRESETS[0]!
}

export function resolveRecordingOutputSize(
  canvas: HTMLCanvasElement,
  preset: RecordingSizePreset,
  custom?: { width: number; height: number } | null
): { width: number; height: number } {
  if (preset.id === 'custom') {
    const w = custom?.width
    const h = custom?.height
    if (typeof w === 'number' && typeof h === 'number' && w >= 2 && h >= 2) {
      return {
        width: toEvenDimension(Math.round(w)),
        height: toEvenDimension(Math.round(h)),
      }
    }
    return {
      width: toEvenDimension(canvas.width),
      height: toEvenDimension(canvas.height),
    }
  }
  if (preset.width == null || preset.height == null) {
    return {
      width: toEvenDimension(canvas.width),
      height: toEvenDimension(canvas.height),
    }
  }
  return {
    width: toEvenDimension(preset.width),
    height: toEvenDimension(preset.height),
  }
}

export const RECORDING_EXPORT_FORMAT_OPTIONS = [
  { value: 'mp4' as const, label: 'MP4 (H.264)' },
  { value: 'webm' as const, label: 'WebM' },
  { value: 'both' as const, label: 'MP4 + WebM' },
]

export function isVideoExportFormat(format: unknown): format is RecordingExportFormat {
  return format === 'mp4' || format === 'webm' || format === 'both'
}

/** Video: seconds × FPS. Images: fixed frame count per revolution. */
export function resolveRecordingCapturePlan(options: {
  mode: RecordingMode
  frameCount: number
  secondsPerRevolution: number
  recordingFps: number
}): { totalFrames: number; encodeFps: number } {
  if (options.mode === 'images') {
    const totalFrames = Math.max(1, Math.round(options.frameCount))
    const seconds = Math.max(1, options.secondsPerRevolution)
    return {
      totalFrames,
      encodeFps: totalFrames / seconds,
    }
  }
  const seconds = Math.max(1, options.secondsPerRevolution)
  const fps = Math.max(1, options.recordingFps)
  return {
    totalFrames: Math.ceil(seconds * fps),
    encodeFps: fps,
  }
}

export const RECORDING_QUALITY_OPTIONS = [
  { value: 'standard' as const, label: 'Standard' },
  { value: 'high' as const, label: 'High bitrate' },
  { value: 'maxCompatible' as const, label: 'Near-lossless (compatible)' },
]

/** Map legacy Low/Medium/High/lossless ids (and current ids) to RecordingQuality. */
export function normalizeRecordingQuality(value: unknown): RecordingQuality {
  if (value === 'maxCompatible' || value === 'lossless') return 'maxCompatible'
  if (value === 'high' || value === 'highBitrate') return 'high'
  if (value === 'standard' || value === 'medium' || value === 'low') return 'standard'
  return 'high'
}

/**
 * Supersampling factor used when capturing frames, keyed by output quality.
 * Higher quality profiles render at a larger internal resolution and then
 * downscale with high-quality filtering, which sharply reduces jagged edges
 * and shimmer in the final video.
 */
export function renderScaleForQuality(quality: RecordingQuality): number {
  return quality === 'standard' ? 1 : 2
}
