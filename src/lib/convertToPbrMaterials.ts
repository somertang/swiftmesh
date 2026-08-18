import {
  Color,
  MathUtils,
  MeshStandardMaterial,
  Vector2,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import { isMeshObject } from './isMeshObject'

const MAP_KEYS = [
  'map',
  'normalMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'lightMap',
] as const

type NonPbrMaterial = Material & {
  isMeshPhongMaterial?: boolean
  isMeshLambertMaterial?: boolean
  shininess?: number
  color?: Color
  emissive?: Color
  specular?: Color
  reflectivity?: number
  emissiveIntensity?: number
  normalScale?: Vector2
  bumpScale?: number
  aoMapIntensity?: number
  lightMapIntensity?: number
}

type MaterialWithMapSlots = Material &
  Partial<Record<(typeof MAP_KEYS)[number], Texture | null>> & {
    name?: string
    opacity?: number
    transparent?: boolean
    alphaTest?: number
    side?: number
    shadowSide?: number | null
    vertexColors?: boolean
    flatShading?: boolean
    wireframe?: boolean
    visible?: boolean
    fog?: boolean
    toneMapped?: boolean
    depthTest?: boolean
    depthWrite?: boolean
    blending?: number
    premultipliedAlpha?: boolean
    dithering?: boolean
    userData?: Record<string, unknown>
  }

function isNonPbrLitMaterial(material: Material): material is NonPbrMaterial {
  return (
    (material as NonPbrMaterial).isMeshPhongMaterial === true ||
    (material as NonPbrMaterial).isMeshLambertMaterial === true
  )
}

function copyCommonMaterialSettings(src: MaterialWithMapSlots, dst: MeshStandardMaterial) {
  dst.name = src.name ?? dst.name
  dst.opacity = src.opacity ?? dst.opacity
  dst.transparent = src.transparent ?? dst.transparent
  dst.alphaTest = src.alphaTest ?? dst.alphaTest
  dst.side = src.side ?? dst.side
  dst.shadowSide = src.shadowSide ?? dst.shadowSide
  dst.vertexColors = src.vertexColors ?? dst.vertexColors
  dst.flatShading = src.flatShading ?? dst.flatShading
  dst.wireframe = src.wireframe ?? dst.wireframe
  dst.visible = src.visible ?? dst.visible
  dst.fog = src.fog ?? dst.fog
  dst.toneMapped = src.toneMapped ?? dst.toneMapped
  dst.depthTest = src.depthTest ?? dst.depthTest
  dst.depthWrite = src.depthWrite ?? dst.depthWrite
  dst.blending = src.blending ?? dst.blending
  dst.premultipliedAlpha = src.premultipliedAlpha ?? dst.premultipliedAlpha
  dst.dithering = src.dithering ?? dst.dithering
  if (src.userData) {
    dst.userData = { ...src.userData }
  }
}

function toStandardMaterial(source: NonPbrMaterial): MeshStandardMaterial {
  const src = source as MaterialWithMapSlots & NonPbrMaterial
  const standard = new MeshStandardMaterial()

  copyCommonMaterialSettings(src, standard)

  if (src.color) standard.color.copy(src.color)
  if (src.emissive) standard.emissive.copy(src.emissive)
  standard.emissiveIntensity = src.emissiveIntensity ?? standard.emissiveIntensity

  for (const key of MAP_KEYS) {
    standard[key] = src[key] ?? null
  }

  if (src.normalScale) {
    standard.normalScale.copy(src.normalScale)
  }
  standard.bumpScale = src.bumpScale ?? standard.bumpScale
  standard.aoMapIntensity = src.aoMapIntensity ?? standard.aoMapIntensity
  standard.lightMapIntensity = src.lightMapIntensity ?? standard.lightMapIntensity

  const shininess = Math.max(src.shininess ?? 0, 0)
  standard.roughness = MathUtils.clamp(1 - Math.sqrt(shininess) / 10, 0, 1)
  standard.metalness = 0
  standard.envMapIntensity = 1
  standard.needsUpdate = true
  return standard
}

export function convertNonPbrMaterialsToPbr(root: Object3D) {
  root.traverse(child => {
    if (!isMeshObject(child)) return
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material]
    let replaced = false
    const converted = sourceMaterials.map(material => {
      if (!material || !isNonPbrLitMaterial(material)) return material
      const standard = toStandardMaterial(material)
      material.dispose()
      replaced = true
      return standard
    })
    if (!replaced) return
    child.material = Array.isArray(child.material) ? converted : converted[0]!
  })
}
