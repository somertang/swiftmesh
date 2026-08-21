import { type Object3D } from 'three'
import {
  exportObjectAsGlb as exportGlb,
  stripRuntimeUserData,
  type ExportGltfResult,
} from '../convert/exportGltf'

export { stripRuntimeUserData }
export type { ExportGltfResult }

/** Export a reduced mesh as GLB (delegates to shared convert exporter). */
export async function exportObjectAsGlb(root: Object3D): Promise<ExportGltfResult> {
  return exportGlb(root)
}
