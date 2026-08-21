import { type AnimationClip, type Object3D } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  sanitizeTexturesForGltfExport,
  waitForObjectTextures,
} from './sanitizeTexturesForGltfExport'

const RUNTIME_USERDATA_KEYS = ['__shadingData', '__hierId', '__hierarchyIgnore'] as const

/** Drop SwiftMesh runtime markers so GLTFExporter does not write them as extras. */
export function stripRuntimeUserData(root: Object3D) {
  root.traverse(object => {
    for (const key of RUNTIME_USERDATA_KEYS) {
      delete object.userData[key]
    }
  })
}

export type ExportGltfOptions = {
  /** true → .glb ArrayBuffer; false → single .gltf JSON with embedded images. */
  binary: boolean
}

export type ExportGltfResult = {
  data: ArrayBuffer
  /** Texture maps removed because GLTFExporter could not encode their images. */
  skippedTextures: number
}

function collectAnimations(root: Object3D): AnimationClip[] {
  if (!Array.isArray(root.animations) || root.animations.length === 0) return []
  return root.animations.slice()
}

/**
 * Export a scene graph as glTF. With `binary: false` and embedded images,
 * the result is a single self-contained `.gltf` file (data URIs, no sidecars).
 *
 * Uses SkeletonUtils.clone so SkinnedMesh / Bone graphs stay valid after export.
 * Waits for textures to finish loading so FBX embedded images are not stripped early.
 */
export async function exportObjectAsGltf(
  root: Object3D,
  options: ExportGltfOptions
): Promise<ExportGltfResult> {
  // Wait on the live graph before cloning so Texture.image is populated.
  await waitForObjectTextures(root)

  const clone = skeletonClone(root)
  // SkeletonUtils clones the graph; AnimationClips live on the Object3D and must be copied.
  if (Array.isArray(root.animations) && root.animations.length > 0) {
    clone.animations = root.animations.map(clip => clip.clone())
  }

  stripRuntimeUserData(clone)
  const skippedTextures = sanitizeTexturesForGltfExport(clone)
  clone.updateMatrixWorld(true)

  const animations = collectAnimations(clone)
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(clone, {
    binary: options.binary,
    onlyVisible: false,
    embedImages: true,
    ...(animations.length > 0 ? { animations } : {}),
  })
  if (result instanceof ArrayBuffer) {
    return { data: result, skippedTextures }
  }
  const json = JSON.stringify(result)
  return { data: new TextEncoder().encode(json).buffer, skippedTextures }
}

export async function exportObjectAsGlb(root: Object3D): Promise<ExportGltfResult> {
  return exportObjectAsGltf(root, { binary: true })
}
