import { describe, expect, it } from 'vitest'
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, Group } from 'three'
import {
  clampIntensity,
  clampTileScale,
  computeGeometryMaxDim,
  createSolidColorTexture,
  createStampTexture,
  DEFAULT_WATERMARK_CONFIG,
  ensureGeometryUv,
  invSizeFromMaxDim,
  resolveFontCss,
} from './index'

describe('watermark types helpers', () => {
  it('clamps intensity and tile scale', () => {
    expect(clampIntensity(-1)).toBe(0)
    expect(clampIntensity(2)).toBe(1)
    expect(clampIntensity(0.4)).toBe(0.4)
    expect(clampTileScale(0)).toBe(0.05)
    expect(clampTileScale(100)).toBe(20)
    expect(clampTileScale(DEFAULT_WATERMARK_CONFIG.tileScale)).toBe(
      DEFAULT_WATERMARK_CONFIG.tileScale
    )
  })

  it('resolves preset and custom font CSS', () => {
    expect(resolveFontCss('monospace', false)).toContain('monospace')
    expect(resolveFontCss('MyFont', true)).toContain('"MyFont"')
  })
})

describe('bboxScale', () => {
  it('computes geometry max dim and invSize', () => {
    const geometry = new BoxGeometry(2, 4, 6)
    expect(computeGeometryMaxDim(geometry)).toBeCloseTo(6, 5)
    expect(invSizeFromMaxDim(6)).toBeCloseTo(1 / 6, 5)
    geometry.dispose()
  })
})

describe('ensureGeometryUv', () => {
  it('creates planar UVs when missing', () => {
    const geometry = new BoxGeometry(2, 2, 2)
    geometry.deleteAttribute('uv')
    expect(geometry.getAttribute('uv')).toBeUndefined()
    const created = ensureGeometryUv(geometry)
    expect(created).toBe(true)
    const uv = geometry.getAttribute('uv')
    expect(uv).toBeTruthy()
    expect(uv!.count).toBe(geometry.getAttribute('position').count)
    geometry.dispose()
  })

  it('is a no-op when UVs already exist', () => {
    const geometry = new BoxGeometry()
    expect(ensureGeometryUv(geometry)).toBe(false)
    geometry.dispose()
  })

  it('returns false for empty geometry', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([], 3))
    expect(ensureGeometryUv(geometry)).toBe(false)
    geometry.dispose()
  })
})

describe('createSolidColorTexture', () => {
  it('fills a canvas with the material color', () => {
    if (typeof document === 'undefined') return
    const tex = createSolidColorTexture(new Color('#336699'), 8)
    expect(tex.image).toBeTruthy()
    expect((tex.image as HTMLCanvasElement).width).toBe(8)
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d')
    expect(ctx).toBeTruthy()
    const pixel = ctx!.getImageData(0, 0, 1, 1).data
    expect(pixel[0]).toBe(0x33)
    expect(pixel[1]).toBe(0x66)
    expect(pixel[2]).toBe(0x99)
    tex.dispose()
  })
})

describe('createStampTexture', () => {
  it('builds a repeatable text stamp with non-zero alpha on glyphs', () => {
    if (typeof document === 'undefined') return
    const tex = createStampTexture({
      ...DEFAULT_WATERMARK_CONFIG,
      mode: 'text',
      text: 'TEST',
      color: '#ff0000',
    })
    expect(tex.image).toBeTruthy()
    const canvas = tex.image as HTMLCanvasElement
    expect(canvas.width).toBeGreaterThan(0)
    const ctx = canvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let maxAlpha = 0
    for (let i = 3; i < data.length; i += 4) maxAlpha = Math.max(maxAlpha, data[i]!)
    expect(maxAlpha).toBeGreaterThan(0)
    tex.dispose()
  })

  it('keys near-black background out of image stamps so artwork alpha remains', () => {
    if (typeof document === 'undefined') return
    const src = document.createElement('canvas')
    src.width = 64
    src.height = 64
    const sctx = src.getContext('2d')!
    sctx.fillStyle = '#000000'
    sctx.fillRect(0, 0, 64, 64)
    sctx.fillStyle = '#ff6600'
    sctx.fillRect(20, 20, 24, 24)

    const tex = createStampTexture({
      ...DEFAULT_WATERMARK_CONFIG,
      mode: 'image',
      image: src,
    })
    const canvas = tex.image as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let orangeVisible = false
    let blackOpaque = false
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const a = data[i + 3]!
      if (a > 200 && r > 200 && g > 80 && g < 150) orangeVisible = true
      if (a > 200 && r < 20 && g < 20 && b < 20) blackOpaque = true
    }
    expect(orangeVisible).toBe(true)
    expect(blackOpaque).toBe(false)
    tex.dispose()
  })

  it('throws when an image stamp has no visible pixels after black-keying', () => {
    if (typeof document === 'undefined') return
    const src = document.createElement('canvas')
    src.width = 32
    src.height = 32
    const sctx = src.getContext('2d')!
    sctx.fillStyle = '#000000'
    sctx.fillRect(0, 0, 32, 32)

    expect(() =>
      createStampTexture({
        ...DEFAULT_WATERMARK_CONFIG,
        mode: 'image',
        image: src,
      })
    ).toThrow(/no visible/)
  })
})

// Keep Mesh/Group imports available for future bake smoke tests in jsdom-less envs.
void Mesh
void MeshStandardMaterial
void Group
