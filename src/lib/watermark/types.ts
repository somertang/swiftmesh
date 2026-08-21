/** Watermark configuration for preview + bake-to-albedo export. */
export type WatermarkMode = 'text' | 'image'

export type WatermarkFontPreset =
  | 'system-ui'
  | 'serif'
  | 'monospace'
  | 'sans-sc'

export type WatermarkConfig = {
  mode: WatermarkMode
  /** Text watermark content (ignored in image mode). */
  text: string
  /** CSS color for text stamps only. */
  color: string
  /** Preset font family key, or a custom FontFace family name after upload. */
  fontFamily: string
  /** Whether fontFamily is a user-uploaded FontFace name. */
  fontIsCustom: boolean
  /** Overlay strength 0–1. */
  intensity: number
  /**
   * World-space tile density. Higher = smaller / more repeats.
   * Applied as `objectPos * tileScale` in triplanar UVs.
   */
  tileScale: number
  /** Optional Y-axis rotation (radians) of the projection space. */
  rotationY: number
  /** Image watermark source (HTMLImageElement / ImageBitmap / canvas). */
  image: CanvasImageSource | null
}

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  mode: 'text',
  text: 'WATERMARK',
  color: '#ffffff',
  fontFamily: 'system-ui',
  fontIsCustom: false,
  intensity: 0.35,
  tileScale: 1.5,
  rotationY: -Math.PI / 6,
  image: null,
}

export const WATERMARK_FONT_PRESETS: ReadonlyArray<{
  id: WatermarkFontPreset
  /** CSS font-family stack. */
  css: string
}> = [
  { id: 'system-ui', css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: 'serif', css: 'Georgia, "Times New Roman", serif' },
  { id: 'monospace', css: 'ui-monospace, "Cascadia Code", Consolas, monospace' },
  {
    id: 'sans-sc',
    css: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif',
  },
]

export function resolveFontCss(fontFamily: string, fontIsCustom: boolean): string {
  if (fontIsCustom) return `"${fontFamily}", system-ui, sans-serif`
  const preset = WATERMARK_FONT_PRESETS.find(p => p.id === fontFamily)
  return preset?.css ?? WATERMARK_FONT_PRESETS[0]!.css
}

export function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WATERMARK_CONFIG.intensity
  return Math.min(1, Math.max(0, value))
}

export function clampTileScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WATERMARK_CONFIG.tileScale
  return Math.min(20, Math.max(0.05, value))
}
