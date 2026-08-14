import {
  MeshBasicMaterial,
  type Mesh,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import { isMeshObject } from './isMeshObject'

export type ShadingMode = 'wireframe' | 'solid' | 'material'

export const DEFAULT_SHADING_MODE: ShadingMode = 'material'

/** Blender-like wireframe line color (unselected). */
export const WIREFRAME_LINE_COLOR = 0x000000

const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'lightMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'specularIntensityMap',
  'specularColorMap',
] as const

type MeshShadingData = {
  originals: Material | Material[]
  temps: Material | Material[] | null
}

function getShadingData(mesh: Mesh): MeshShadingData {
  let data = mesh.userData.__shadingData as MeshShadingData | undefined
  if (!data) {
    data = { originals: mesh.material, temps: null }
    mesh.userData.__shadingData = data
  }
  return data
}

function disposeTemps(data: MeshShadingData) {
  if (!data.temps) return
  const list = Array.isArray(data.temps) ? data.temps : [data.temps]
  for (const material of list) {
    material.dispose()
  }
  data.temps = null
}

function asList(materials: Material | Material[]): Material[] {
  return Array.isArray(materials) ? materials : [materials]
}

function fromList(list: Material[], wasArray: boolean): Material | Material[] {
  return wasArray ? list : list[0]!
}

function createWireframeMaterials(count: number): Material[] {
  return Array.from(
    { length: count },
    () =>
      new MeshBasicMaterial({
        color: WIREFRAME_LINE_COLOR,
        wireframe: true,
        toneMapped: false,
      })
  )
}

function createSolidMaterials(originals: Material[]): Material[] {
  return originals.map(source => {
    const cloned = source.clone()
    for (const key of TEXTURE_KEYS) {
      if (key in cloned) {
        ;(cloned as Material & Record<string, Texture | null>)[key] = null
      }
    }
    if ('wireframe' in cloned) {
      ;(cloned as Material & { wireframe: boolean }).wireframe = false
    }
    cloned.needsUpdate = true
    return cloned
  })
}

/** Mutates display-root mesh materials to match the requested viewport shading mode. */
export function applyShadingMode(root: Object3D | null, mode: ShadingMode) {
  if (!root) return

  root.traverse(child => {
    if (!isMeshObject(child) || child.userData.__hierarchyIgnore) return

    const data = getShadingData(child)
    disposeTemps(data)

    const originals = data.originals
    const wasArray = Array.isArray(originals)
    const originalList = asList(originals)

    if (mode === 'material') {
      child.material = originals
      return
    }

    if (mode === 'wireframe') {
      const temps = createWireframeMaterials(originalList.length)
      data.temps = fromList(temps, wasArray)
      child.material = data.temps
      return
    }

    // solid
    const temps = createSolidMaterials(originalList)
    data.temps = fromList(temps, wasArray)
    child.material = data.temps
  })
}
