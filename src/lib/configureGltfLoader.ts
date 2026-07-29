import type { WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { attachResourceUrlModifier } from './modelSource'

const dracoPath = `${import.meta.env.BASE_URL}vendor/draco/gltf/`
const basisPath = `${import.meta.env.BASE_URL}vendor/basis/`

let dracoLoader: DRACOLoader | null = null
let ktx2Loader: KTX2Loader | null = null
let ktx2BoundRenderer: WebGLRenderer | null = null

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(dracoPath)
    // Prefer bundled JS decoder so offline works without draco_decoder.wasm.
    dracoLoader.setDecoderConfig({ type: 'js' })
    dracoLoader.preload()
  }
  return dracoLoader
}

/** Bind KTX2 transcoder to the active WebGL renderer (required for Basis/KTX2 textures). */
export function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (!ktx2Loader || ktx2BoundRenderer !== renderer) {
    ktx2Loader?.dispose()
    ktx2Loader = new KTX2Loader()
    ktx2Loader.setTranscoderPath(basisPath)
    ktx2Loader.detectSupport(renderer)
    ktx2BoundRenderer = renderer
  }
  return ktx2Loader
}

export function configureGltfLoader(
  loader: GLTFLoader,
  options: {
    resourceUrls?: Record<string, string>
    ktx2Loader?: KTX2Loader
  } = {}
) {
  if (options.resourceUrls && Object.keys(options.resourceUrls).length > 0) {
    attachResourceUrlModifier(loader.manager, options.resourceUrls)
  }
  loader.setDRACOLoader(getDracoLoader())
  loader.setMeshoptDecoder(MeshoptDecoder)
  if (options.ktx2Loader) {
    loader.setKTX2Loader(options.ktx2Loader)
  }
}
