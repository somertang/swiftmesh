import type { Object3D } from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { configureFbxLoader } from '../configureFbxLoader'
import { configureGltfLoader } from '../configureGltfLoader'
import { convertNonPbrMaterialsToPbr } from '../convertToPbrMaterials'
import {
  attachResourceUrlModifier,
  basenameOf,
  type ModelSource,
} from '../modelSource'
import { waitForObjectTextures } from './sanitizeTexturesForGltfExport'

function findMtlBlobUrl(resourceUrls: Record<string, string>): string | null {
  for (const [key, url] of Object.entries(resourceUrls)) {
    if (/\.mtl$/i.test(key) || /\.mtl$/i.test(basenameOf(key))) return url
  }
  return null
}

/**
 * Load a ModelSource into an Object3D off the viewer (no R3F / Canvas).
 * Applies PBR material conversion so OBJ/FBX export matches viewport intent.
 * Does not apply unit normalize or ground placement (those are display-only).
 */
export async function loadModelSourceToObject3D(source: ModelSource): Promise<Object3D> {
  let root: Object3D

  if (source.format === 'glb' || source.format === 'gltf') {
    const loader = new GLTFLoader()
    configureGltfLoader(loader, { resourceUrls: source.resourceUrls })
    const gltf = await loader.loadAsync(source.mainUrl)
    root = gltf.scene
    if (gltf.animations.length > 0) {
      root.animations = gltf.animations
    }
  } else if (source.format === 'obj') {
    const mtlUrl = findMtlBlobUrl(source.resourceUrls)
    const objLoader = new OBJLoader()
    attachResourceUrlModifier(objLoader.manager, source.resourceUrls)
    if (mtlUrl) {
      const mtlLoader = new MTLLoader()
      attachResourceUrlModifier(mtlLoader.manager, source.resourceUrls)
      const materials = await mtlLoader.loadAsync(mtlUrl)
      materials.preload()
      objLoader.setMaterials(materials)
    }
    root = await objLoader.loadAsync(source.mainUrl)
  } else if (source.format === 'fbx') {
    const loader = new FBXLoader()
    configureFbxLoader(loader, source.resourceUrls)
    root = await loader.loadAsync(source.mainUrl)
  } else {
    const _exhaustive: never = source.format
    throw new Error(`Unsupported format: ${_exhaustive}`)
  }

  convertNonPbrMaterialsToPbr(root)
  // Ensure TextureLoader / blob embeds finished before callers export.
  await waitForObjectTextures(root)
  return root
}

/** Revoke blob URLs created for a ModelSource (main + sidecars). */
export function revokeModelSourceUrls(source: ModelSource) {
  URL.revokeObjectURL(source.mainUrl)
  const seen = new Set<string>()
  for (const url of Object.values(source.resourceUrls)) {
    if (seen.has(url)) continue
    seen.add(url)
    URL.revokeObjectURL(url)
  }
}
