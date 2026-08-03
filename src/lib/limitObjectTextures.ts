import {
  Mesh,
  type Material,
  type Object3D,
  type Texture,
} from 'three'

function isTexture(value: unknown): value is Texture {
  return Boolean(value && typeof value === 'object' && (value as Texture).isTexture)
}

function readImageSize(image: unknown): { width: number; height: number } | null {
  if (!image || typeof image !== 'object') return null
  const w = (image as { width?: unknown }).width
  const h = (image as { height?: unknown }).height
  if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) return null
  return { width: w, height: h }
}

function downscaleTextureImage(texture: Texture, maxSize: number) {
  const size = readImageSize(texture.image)
  if (!size) return
  const maxDim = Math.max(size.width, size.height)
  if (maxDim <= maxSize) return

  const scale = maxSize / maxDim
  const nextW = Math.max(1, Math.round(size.width * scale))
  const nextH = Math.max(1, Math.round(size.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = nextW
  canvas.height = nextH
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  try {
    ctx.drawImage(texture.image as CanvasImageSource, 0, 0, nextW, nextH)
    texture.image = canvas
    texture.needsUpdate = true
  } catch {
    /* Compressed / non-drawable sources — leave as-is. */
  }
}

function collectMaterialTextures(material: Material): Texture[] {
  const textures: Texture[] = []
  for (const value of Object.values(material)) {
    if (isTexture(value)) textures.push(value)
  }
  return textures
}

/** Downscale drawable textures on a display scene graph. No-op when maxSize <= 0. */
export function limitObjectTextures(root: Object3D, maxSize: number) {
  if (!Number.isFinite(maxSize) || maxSize <= 0) return

  const seen = new Set<Texture>()
  root.traverse(child => {
    if (!(child instanceof Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material) continue
      for (const texture of collectMaterialTextures(material)) {
        if (seen.has(texture)) continue
        seen.add(texture)
        downscaleTextureImage(texture, maxSize)
      }
    }
  })
}
