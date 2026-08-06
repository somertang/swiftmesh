/** H.264/yuv420p requires even width and height. */
import type { RecordingQuality } from '../desktopTypes'

export function toEvenDimension(value: number): number {
  const even = value & ~1
  return even > 0 ? even : 2
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
  preset: RecordingSizePreset
): { width: number; height: number } {
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
