export type {
  WatermarkConfig,
  WatermarkFontPreset,
  WatermarkMode,
} from './types'
export {
  DEFAULT_WATERMARK_CONFIG,
  WATERMARK_FONT_PRESETS,
  clampIntensity,
  clampTileScale,
  resolveFontCss,
} from './types'
export { loadUserFont, unloadUserFont } from './loadUserFont'
export { createStampTexture, STAMP_SIZE, WatermarkStampError } from './createStampTexture'
export { applyTriplanarPreview, clearTriplanarPreview } from './applyTriplanarPreview'
export {
  computeGeometryMaxDim,
  computeObjectMaxDim,
  invSizeFromMaxDim,
} from './bboxScale'
export {
  bakeWatermarkToAlbedo,
  createSolidColorTexture,
  ensureGeometryUv,
  type BakeWatermarkResult,
} from './bakeWatermarkToAlbedo'
