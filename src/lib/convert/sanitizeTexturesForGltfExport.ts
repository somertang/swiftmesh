import {
  type Material,
  type Object3D,
  type Texture,
} from 'three'

/** Material slots GLTFExporter may try to encode as images. */
export const TEXTURE_KEYS = [
  'map',
  'lightMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'normalMap',
  'displacementMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'envMap',
  'specularMap',
  'specularIntensityMap',
  'specularColorMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
  'gradientMap',
] as const

export function textureImage(texture: Texture): unknown {
  if (texture.image != null) return texture.image
  const source = (texture as Texture & { source?: { data?: unknown } }).source
  return source?.data ?? null
}

/** Whether GLTFExporter.processImage can draw/encode this image. */
export function isGltfExportableImage(image: unknown): boolean {
  if (image == null) return false

  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return image.width > 0 && image.height > 0
  }
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return image.width > 0 && image.height > 0
  }
  if (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas) {
    return image.width > 0 && image.height > 0
  }
  // THREE.DataTexture / Data3DTexture-style image descriptors
  if (typeof image === 'object' && 'data' in image && 'width' in image && 'height' in image) {
    const dataImage = image as { data?: ArrayBufferView | null; width: number; height: number }
    return Boolean(dataImage.data && dataImage.width > 0 && dataImage.height > 0)
  }
  return false
}

/** Confirmed broken (not merely still loading). */
export function isConfirmedFailedTextureImage(image: unknown): boolean {
  if (image == null) return false
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return image.complete && (image.naturalWidth === 0 || image.naturalHeight === 0)
  }
  return false
}

function isTexture(value: unknown): value is Texture {
  return Boolean(value && typeof value === 'object' && (value as Texture).isTexture === true)
}

function materialsOf(object: Object3D): Material[] {
  const material = (object as Object3D & { material?: Material | Material[] }).material
  if (!material) return []
  return Array.isArray(material) ? material : [material]
}

export function collectObjectTextures(root: Object3D): Texture[] {
  const seen = new Set<Texture>()
  const out: Texture[] = []
  root.traverse(object => {
    for (const material of materialsOf(object)) {
      const slots = material as Material & Record<string, unknown>
      for (const key of TEXTURE_KEYS) {
        const value = slots[key]
        if (!isTexture(value) || seen.has(value)) continue
        seen.add(value)
        out.push(value)
      }
    }
  })
  return out
}

function waitForHtmlImage(image: HTMLImageElement, timeoutMs: number): Promise<'ready' | 'failed' | 'timeout'> {
  if (image.complete) {
    return Promise.resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? 'ready' : 'failed')
  }
  return new Promise(resolve => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve(
        image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 ? 'ready' : 'timeout'
      )
    }, timeoutMs)
    const cleanup = () => {
      window.clearTimeout(timer)
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
    }
    const onLoad = () => {
      cleanup()
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? 'ready' : 'failed')
    }
    const onError = () => {
      cleanup()
      resolve('failed')
    }
    image.addEventListener('load', onLoad)
    image.addEventListener('error', onError)
  })
}

function waitForTextureReady(texture: Texture, timeoutMs: number): Promise<'ready' | 'failed' | 'timeout'> {
  const image = textureImage(texture)
  if (isGltfExportableImage(image)) return Promise.resolve('ready')
  if (isConfirmedFailedTextureImage(image)) return Promise.resolve('failed')

  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return waitForHtmlImage(image, timeoutMs)
  }

  // Still null / unknown — poll until image appears (TextureLoader async assign).
  return new Promise(resolve => {
    const start = Date.now()
    const tick = () => {
      const current = textureImage(texture)
      if (isGltfExportableImage(current)) {
        resolve('ready')
        return
      }
      if (isConfirmedFailedTextureImage(current)) {
        resolve('failed')
        return
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(isGltfExportableImage(textureImage(texture)) ? 'ready' : 'timeout')
        return
      }
      window.requestAnimationFrame(tick)
    }
    tick()
  })
}

/**
 * Wait until material textures are loaded (or confirmed failed / timed out).
 * Call before cloning + GLTF export so embedded FBX images are not stripped while loading.
 */
export async function waitForObjectTextures(
  root: Object3D,
  timeoutMs = 60_000
): Promise<{ ready: number; failed: number; timedOut: number }> {
  const textures = collectObjectTextures(root)
  if (textures.length === 0) return { ready: 0, failed: 0, timedOut: 0 }

  const perTextureTimeout = Math.max(5_000, Math.ceil(timeoutMs / Math.min(textures.length, 8)))
  const results = await Promise.all(
    textures.map(texture => waitForTextureReady(texture, perTextureTimeout))
  )

  let ready = 0
  let failed = 0
  let timedOut = 0
  for (const status of results) {
    if (status === 'ready') ready += 1
    else if (status === 'failed') failed += 1
    else timedOut += 1
  }
  return { ready, failed, timedOut }
}

/**
 * Drop texture maps GLTFExporter cannot encode (confirmed missing / broken image data).
 * Does not remove maps that are merely still loading — call waitForObjectTextures first.
 * Mutates materials on `root`. Returns how many maps were cleared.
 */
export function sanitizeTexturesForGltfExport(root: Object3D): number {
  let skipped = 0
  root.traverse(object => {
    for (const material of materialsOf(object)) {
      const slots = material as Material & Record<string, unknown>
      let changed = false
      for (const key of TEXTURE_KEYS) {
        const value = slots[key]
        if (!isTexture(value)) continue
        const image = textureImage(value)
        if (isGltfExportableImage(image)) continue
        // Still loading: leave in place (caller should have waited). Only strip confirmed bad / empty.
        if (
          typeof HTMLImageElement !== 'undefined' &&
          image instanceof HTMLImageElement &&
          !image.complete
        ) {
          continue
        }
        slots[key] = null
        skipped += 1
        changed = true
      }
      if (changed) material.needsUpdate = true
    }
  })
  return skipped
}
