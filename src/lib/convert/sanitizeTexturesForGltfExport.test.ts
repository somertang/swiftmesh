import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, BoxGeometry, Texture } from 'three'
import {
  isGltfExportableImage,
  sanitizeTexturesForGltfExport,
} from './sanitizeTexturesForGltfExport'

describe('sanitizeTexturesForGltfExport', () => {
  it('treats null and empty images as non-exportable', () => {
    expect(isGltfExportableImage(null)).toBe(false)
    expect(isGltfExportableImage(undefined)).toBe(false)
    expect(isGltfExportableImage({ data: null, width: 4, height: 4 })).toBe(false)
    expect(
      isGltfExportableImage({ data: new Uint8Array(16), width: 2, height: 2 })
    ).toBe(true)
  })

  it('clears texture slots without valid image data', () => {
    const broken = new Texture()
    broken.image = null
    const ok = new Texture()
    ok.image = { data: new Uint8Array(16), width: 2, height: 2 }

    const material = new MeshStandardMaterial({ map: broken, normalMap: ok })
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), material))

    const skipped = sanitizeTexturesForGltfExport(root)

    expect(skipped).toBe(1)
    expect(material.map).toBeNull()
    expect(material.normalMap).toBe(ok)

    material.dispose()
    ;(root.children[0] as Mesh).geometry.dispose()
  })

  it('does not strip HTMLImageElement textures that are still loading', () => {
    const loading = new Texture()
    // Incomplete image mock — not a real HTMLImageElement in jsdom/node, so use a
    // stand-in only when available; otherwise skip this environment-specific case.
    if (typeof Image === 'undefined') return
    const img = new Image()
    Object.defineProperty(img, 'complete', { value: false })
    Object.defineProperty(img, 'naturalWidth', { value: 0 })
    Object.defineProperty(img, 'naturalHeight', { value: 0 })
    loading.image = img

    const material = new MeshStandardMaterial({ map: loading })
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), material))

    const skipped = sanitizeTexturesForGltfExport(root)

    expect(skipped).toBe(0)
    expect(material.map).toBe(loading)

    material.dispose()
    ;(root.children[0] as Mesh).geometry.dispose()
  })
})
