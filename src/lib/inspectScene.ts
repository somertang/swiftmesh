import {
  Texture,
  type Mesh,
  type Material,
  type Object3D,
  type BufferGeometry,
} from 'three'
import { isMeshObject } from './isMeshObject'

const TEXTURE_SLOTS = [
  'map',
  'emissiveMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'normalMap',
  'displacementMap',
  'alphaMap',
  'envMap',
  'lightMap',
  'bumpMap',
  'specularMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'clearcoatMap',
  'clearcoatRoughnessMap',
  'clearcoatNormalMap',
] as const

export type TextureInspectItem = {
  id: string
  name: string
  width: number
  height: number
  slots: string[]
  meshNames: string[]
  materialNames: string[]
  previewUrl: string | null
  texture: Texture
}

export type MaterialInspectItem = {
  id: string
  name: string
  type: string
  meshNames: string[]
  meshIds: string[]
  color: string | null
  opacity: number
  transparent: boolean
  mapSlots: string[]
}

export type GeometryInspectItem = {
  id: string
  name: string
  vertexCount: number
  triangleCount: number
  attributes: string[]
  meshNames: string[]
  meshIds: string[]
}

export type SceneInfoStats = {
  meshCount: number
  skinnedMeshCount: number
  materialCount: number
  textureCount: number
  geometryCount: number
  vertexCount: number
  triangleCount: number
  animationCount: number
  drawCallEstimate: number
  modelLabel: string
}

function meshLabel(object: Object3D) {
  return object.name?.trim() || object.type || 'Mesh'
}

function materialLabel(material: Material, index: number) {
  return material.name?.trim() || `Material ${index + 1}`
}

function colorToCss(material: Material): string | null {
  if (!('color' in material)) return null
  const color = (material as Material & { color?: { getHexString?: () => string } }).color
  if (!color?.getHexString) return null
  return `#${color.getHexString()}`
}

function textureSize(texture: Texture): { width: number; height: number } {
  const image = texture.image as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    | undefined
  if (!image) return { width: 0, height: 0 }
  return {
    width: image.width ?? image.videoWidth ?? 0,
    height: image.height ?? image.videoHeight ?? 0,
  }
}

export function createTexturePreviewUrl(texture: Texture): string | null {
  const image = texture.image as CanvasImageSource | ImageBitmap | HTMLImageElement | HTMLCanvasElement | null
  if (!image) return null

  try {
    const width = 'width' in image ? Number(image.width) || 0 : 0
    const height = 'height' in image ? Number(image.height) || 0 : 0
    if (!width || !height) return null

    const canvas = document.createElement('canvas')
    const maxSide = 128
    const scale = Math.min(1, maxSide / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export function downloadTexturePng(texture: Texture, filename: string) {
  const url = createTexturePreviewUrl(texture)
  if (!url) return false
  const full = document.createElement('canvas')
  const image = texture.image as CanvasImageSource
  const size = textureSize(texture)
  if (!size.width || !size.height) return false
  try {
    full.width = size.width
    full.height = size.height
    const ctx = full.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(image, 0, 0)
    const href = full.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = href
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`
    a.click()
    return true
  } catch {
    // fallback to preview-sized download
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`
    a.click()
    return true
  }
}

export function extractTextures(root: Object3D): TextureInspectItem[] {
  const byUuid = new Map<
    string,
    {
      texture: Texture
      slots: Set<string>
      meshNames: Set<string>
      materialNames: Set<string>
    }
  >()

  root.traverse(child => {
    if (!isMeshObject(child) || !child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material, materialIndex) => {
      if (!material) return
      for (const slot of TEXTURE_SLOTS) {
        const value = (material as Material & Record<string, unknown>)[slot]
        if (!(value instanceof Texture)) continue
        const entry = byUuid.get(value.uuid) ?? {
          texture: value,
          slots: new Set<string>(),
          meshNames: new Set<string>(),
          materialNames: new Set<string>(),
        }
        entry.slots.add(slot)
        entry.meshNames.add(meshLabel(child))
        entry.materialNames.add(materialLabel(material, materialIndex))
        byUuid.set(value.uuid, entry)
      }
    })
  })

  return [...byUuid.entries()].map(([id, entry], index) => {
    const size = textureSize(entry.texture)
    return {
      id,
      name: entry.texture.name?.trim() || `Texture ${index + 1}`,
      width: size.width,
      height: size.height,
      slots: [...entry.slots],
      meshNames: [...entry.meshNames],
      materialNames: [...entry.materialNames],
      previewUrl: createTexturePreviewUrl(entry.texture),
      texture: entry.texture,
    }
  })
}

export function extractMaterials(root: Object3D): MaterialInspectItem[] {
  const byUuid = new Map<
    string,
    {
      material: Material
      meshNames: Set<string>
      meshIds: Set<string>
    }
  >()

  root.traverse(child => {
    if (!isMeshObject(child) || !child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach(material => {
      if (!material) return
      const entry = byUuid.get(material.uuid) ?? {
        material,
        meshNames: new Set<string>(),
        meshIds: new Set<string>(),
      }
      entry.meshNames.add(meshLabel(child))
      if (typeof child.userData.__hierId === 'string') {
        entry.meshIds.add(child.userData.__hierId)
      }
      byUuid.set(material.uuid, entry)
    })
  })

  return [...byUuid.entries()].map(([id, entry], index) => {
    const mapSlots = TEXTURE_SLOTS.filter(slot => {
      const value = (entry.material as Material & Record<string, unknown>)[slot]
      return value instanceof Texture
    })
    return {
      id,
      name: materialLabel(entry.material, index),
      type: entry.material.type,
      meshNames: [...entry.meshNames],
      meshIds: [...entry.meshIds],
      color: colorToCss(entry.material),
      opacity: entry.material.opacity,
      transparent: entry.material.transparent,
      mapSlots,
    }
  })
}

function triangleCount(geometry: BufferGeometry) {
  const index = geometry.index
  if (index) return Math.floor(index.count / 3)
  const position = geometry.getAttribute('position')
  return position ? Math.floor(position.count / 3) : 0
}

export function extractGeometries(root: Object3D): GeometryInspectItem[] {
  const byUuid = new Map<
    string,
    {
      geometry: BufferGeometry
      meshNames: Set<string>
      meshIds: Set<string>
    }
  >()

  root.traverse(child => {
    if (!isMeshObject(child) || !child.geometry) return
    const geometry = child.geometry as BufferGeometry
    const entry = byUuid.get(geometry.uuid) ?? {
      geometry,
      meshNames: new Set<string>(),
      meshIds: new Set<string>(),
    }
    entry.meshNames.add(meshLabel(child))
    if (typeof child.userData.__hierId === 'string') {
      entry.meshIds.add(child.userData.__hierId)
    }
    byUuid.set(geometry.uuid, entry)
  })

  return [...byUuid.entries()]
    .map(([id, entry], index) => {
      const position = entry.geometry.getAttribute('position')
      return {
        id,
        name: entry.geometry.name?.trim() || `Geometry ${index + 1}`,
        vertexCount: position?.count ?? 0,
        triangleCount: triangleCount(entry.geometry),
        attributes: Object.keys(entry.geometry.attributes),
        meshNames: [...entry.meshNames],
        meshIds: [...entry.meshIds],
      }
    })
    .sort((a, b) => b.vertexCount - a.vertexCount)
}

/**
 * Resolve display-hierarchy `__hierId`s for mesh names collected from an inspect root
 * (e.g. the original GLTF scene that never received hierarchy ids).
 */
export function resolveMeshIdsByName(
  meshNames: string[],
  objects: Map<string, Object3D>
): string[] {
  if (meshNames.length === 0 || objects.size === 0) return []
  const nameSet = new Set(meshNames)
  const ids: string[] = []
  for (const [id, object] of objects) {
    if (!isMeshObject(object)) continue
    if (nameSet.has(meshLabel(object))) ids.push(id)
  }
  return ids
}

export function withResolvedMeshIds<T extends { meshNames: string[]; meshIds: string[] }>(
  items: T[],
  objects: Map<string, Object3D>
): T[] {
  if (objects.size === 0) return items
  return items.map(item => ({
    ...item,
    meshIds: resolveMeshIdsByName(item.meshNames, objects),
  }))
}

/**
 * @param displayRoot – rendered / hierarchy root (Lambert clone)
 * @param inspectRoot – optional original GLTF scene for material/texture counts
 * @param animationCount – clip count from the loader (glTF / FBX)
 */
export function extractSceneInfo(
  displayRoot: Object3D,
  modelLabel: string,
  inspectRoot?: Object3D | null,
  animationCount = 0
): SceneInfoStats {
  const materialSource = inspectRoot ?? displayRoot
  const materials = extractMaterials(materialSource)
  const textures = extractTextures(materialSource)
  const geometries = extractGeometries(displayRoot)

  let meshCount = 0
  let skinnedMeshCount = 0
  let vertexCount = 0
  let triangleTotal = 0

  displayRoot.traverse(child => {
    if (!isMeshObject(child) || !child.geometry) return
    meshCount += 1
    if ((child as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) skinnedMeshCount += 1
    const geometry = child.geometry as BufferGeometry
    const position = geometry.getAttribute('position')
    vertexCount += position?.count ?? 0
    triangleTotal += triangleCount(geometry)
  })

  return {
    meshCount,
    skinnedMeshCount,
    materialCount: materials.length,
    textureCount: textures.length,
    geometryCount: geometries.length,
    vertexCount,
    triangleCount: triangleTotal,
    animationCount,
    drawCallEstimate: meshCount,
    modelLabel,
  }
}
