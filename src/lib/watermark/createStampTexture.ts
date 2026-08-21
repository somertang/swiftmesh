import {
  CanvasTexture,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { resolveFontCss, type WatermarkConfig } from './types'

const STAMP_SIZE = 512

export class WatermarkStampError extends Error {
  readonly code: 'empty' | 'context'

  constructor(code: 'empty' | 'context', message: string) {
    super(message)
    this.name = 'WatermarkStampError'
    this.code = code
  }
}

function parseCssColorToRgba(color: string): { r: number; g: number; b: number; a: number } {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return { r: 255, g: 255, b: 255, a: 255 }
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return { r: r ?? 255, g: g ?? 255, b: b ?? 255, a: a ?? 255 }
}

function drawTiledText(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  color: string,
  fontCss: string
) {
  ctx.clearRect(0, 0, size, size)
  const fontSize = Math.max(18, Math.round(size * 0.12))
  ctx.font = `600 ${fontSize}px ${fontCss}`
  const { r, g, b, a } = parseCssColorToRgba(color)
  // Explicit rgba so glyph alpha is never dropped by fillStyle quirks.
  ctx.fillStyle = `rgba(${r},${g},${b},${(a / 255) || 1})`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 1

  const label = text.trim() || ' '
  const step = Math.max(fontSize * 3.2, size * 0.45)
  for (let y = -step; y < size + step; y += step) {
    for (let x = -step; x < size + step; x += step) {
      ctx.save()
      ctx.translate(x + step * 0.5, y + step * 0.5)
      ctx.rotate(-Math.PI / 6)
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }
}

function maxAlphaInCanvas(ctx: CanvasRenderingContext2D, size: number): number {
  try {
    const data = ctx.getImageData(0, 0, size, size).data
    let maxA = 0
    for (let i = 3; i < data.length; i += 4) {
      maxA = Math.max(maxA, data[i]!)
      if (maxA >= 255) return maxA
    }
    return maxA
  } catch {
    // Tainted canvas — cannot verify; assume visible.
    return 255
  }
}

function drawImageStamp(ctx: CanvasRenderingContext2D, size: number, image: CanvasImageSource) {
  ctx.clearRect(0, 0, size, size)
  const iw =
    'naturalWidth' in image && typeof image.naturalWidth === 'number' && image.naturalWidth > 0
      ? image.naturalWidth
      : 'width' in image && typeof image.width === 'number'
        ? image.width
        : size
  const ih =
    'naturalHeight' in image && typeof image.naturalHeight === 'number' && image.naturalHeight > 0
      ? image.naturalHeight
      : 'height' in image && typeof image.height === 'number'
        ? image.height
        : size
  if (iw <= 0 || ih <= 0) {
    throw new WatermarkStampError('empty', 'Image watermark has invalid dimensions')
  }

  const pad = size * 0.12
  const avail = size - pad * 2
  const scale = Math.min(avail / iw, avail / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = (size - dw) / 2
  const dy = (size - dh) / 2
  ctx.drawImage(image, dx, dy, dw, dh)

  // Logos often ship on an opaque black plate; key near-black to transparent so
  // only the artwork contributes stamp alpha (otherwise the whole plate washes the mesh).
  try {
    const pixels = ctx.getImageData(0, 0, size, size)
    const data = pixels.data
    const blackKey = 18
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      if (r <= blackKey && g <= blackKey && b <= blackKey) {
        data[i + 3] = 0
      }
    }
    ctx.putImageData(pixels, 0, 0)
  } catch {
    // Tainted canvas (cross-origin) — keep the drawn image as-is.
  }
}

/** True if the stamp canvas has any visible coverage. */
export function stampTextureHasVisibleAlpha(texture: Texture): boolean {
  const image = texture.image as { width?: number; height?: number } | HTMLCanvasElement | null
  if (!image || typeof document === 'undefined') return true
  if (!(image instanceof HTMLCanvasElement)) return true
  const ctx = image.getContext('2d')
  if (!ctx) return true
  return maxAlphaInCanvas(ctx, image.width) > 0
}

/** Build a repeatable stamp CanvasTexture from watermark config. */
export function createStampTexture(config: WatermarkConfig): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = STAMP_SIZE
  canvas.height = STAMP_SIZE
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) {
    throw new WatermarkStampError('context', 'Could not create 2D canvas context for watermark stamp')
  }

  if (config.mode === 'image' && config.image) {
    drawImageStamp(ctx, STAMP_SIZE, config.image)
    if (maxAlphaInCanvas(ctx, STAMP_SIZE) <= 0) {
      throw new WatermarkStampError(
        'empty',
        'Image watermark has no visible pixels after processing'
      )
    }
  } else {
    drawTiledText(
      ctx,
      STAMP_SIZE,
      config.text,
      config.color,
      resolveFontCss(config.fontFamily, config.fontIsCustom)
    )
  }

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  texture.premultiplyAlpha = false
  texture.needsUpdate = true
  return texture
}

export { STAMP_SIZE }
