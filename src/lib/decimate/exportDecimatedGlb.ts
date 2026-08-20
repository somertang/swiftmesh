import { type Object3D } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const RUNTIME_USERDATA_KEYS = ['__shadingData', '__hierId', '__hierarchyIgnore'] as const

/** Drop SwiftMesh runtime markers so GLTFExporter does not write them as extras. */
export function stripRuntimeUserData(root: Object3D) {
  root.traverse(object => {
    for (const key of RUNTIME_USERDATA_KEYS) {
      delete object.userData[key]
    }
  })
}

export async function exportObjectAsGlb(root: Object3D): Promise<ArrayBuffer> {
  const clone = root.clone(true)
  stripRuntimeUserData(clone)
  clone.updateMatrixWorld(true)
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(clone, {
    binary: true,
    onlyVisible: false,
    embedImages: true,
  })
  if (result instanceof ArrayBuffer) return result
  const json = JSON.stringify(result)
  return new TextEncoder().encode(json).buffer
}
