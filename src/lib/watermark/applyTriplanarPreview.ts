import {
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three'
import { isMeshObject } from '../isMeshObject'
import { computeGeometryMaxDim, invSizeFromMaxDim } from './bboxScale'
import { clampIntensity, clampTileScale, type WatermarkConfig, type WatermarkMode } from './types'
import { TRIPLANAR_SAMPLE_FN, TRIPLANAR_UNIFORM_DECLS } from './triplanarShader'

const USERDATA_KEY = '__wmPreview'
const CACHE_KEY = 'swiftmesh-wm-preview-v3'

function computeRootLocalMaxDim(root: Object3D): number {
  let maxDim = 0
  root.traverse(obj => {
    if (!isMeshObject(obj) || !obj.geometry) return
    maxDim = Math.max(maxDim, computeGeometryMaxDim(obj.geometry))
  })
  return maxDim > 0 ? maxDim : 1
}

type PreviewState = {
  stamp: Texture
  mode: WatermarkMode
  generation: number
  intensity: number
  tileScale: number
  rotationY: number
  invSize: number
  patched: WeakSet<Material>
  originals: Map<
    Material,
    {
      onBeforeCompile: Material['onBeforeCompile']
      customProgramCacheKey: Material['customProgramCacheKey']
    }
  >
  shaders: Map<Material, WebGLProgramParametersWithUniforms>
}

let previewGeneration = 0

function nextGeneration(): number {
  previewGeneration += 1
  return previewGeneration
}

function cacheKeyFor(state: PreviewState): string {
  return `${CACHE_KEY}-${state.mode}-g${state.generation}`
}

function isStandardLike(material: Material): material is MeshStandardMaterial {
  return (
    (material as MeshStandardMaterial).isMeshStandardMaterial === true ||
    (material as { isMeshPhysicalMaterial?: boolean }).isMeshPhysicalMaterial === true
  )
}

function pushUniforms(shader: WebGLProgramParametersWithUniforms, state: PreviewState) {
  if (!shader.uniforms.uWmStamp) {
    shader.uniforms.uWmStamp = { value: state.stamp }
    shader.uniforms.uWmIntensity = { value: state.intensity }
    shader.uniforms.uWmTileScale = { value: state.tileScale }
    shader.uniforms.uWmRotationY = { value: state.rotationY }
    shader.uniforms.uWmInvSize = { value: state.invSize }
  } else {
    shader.uniforms.uWmStamp.value = state.stamp
    shader.uniforms.uWmIntensity.value = state.intensity
    shader.uniforms.uWmTileScale.value = state.tileScale
    shader.uniforms.uWmRotationY.value = state.rotationY
    shader.uniforms.uWmInvSize.value = state.invSize
  }
}

function patchMaterial(material: MeshStandardMaterial, state: PreviewState) {
  if (state.patched.has(material)) return
  state.patched.add(material)
  state.originals.set(material, {
    onBeforeCompile: material.onBeforeCompile,
    customProgramCacheKey: material.customProgramCacheKey,
  })

  material.customProgramCacheKey = () => cacheKeyFor(state)
  material.onBeforeCompile = (
    parameters: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer
  ) => {
    const prev = state.originals.get(material)?.onBeforeCompile
    if (prev) prev.call(material, parameters, renderer)

    pushUniforms(parameters, state)
    state.shaders.set(material, parameters)

    if (!parameters.vertexShader.includes('vWmPos')) {
      parameters.vertexShader = parameters.vertexShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vWmPos;
varying vec3 vWmNormal;`
      )
      parameters.vertexShader = parameters.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWmPos = position;
vWmNormal = normal;`
      )

      parameters.fragmentShader = parameters.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vWmPos;
varying vec3 vWmNormal;
${TRIPLANAR_UNIFORM_DECLS}
${TRIPLANAR_SAMPLE_FN}`
      )
      // After map (and after color if no map content) — diffuseColor is ready.
      if (parameters.fragmentShader.includes('#include <map_fragment>')) {
        parameters.fragmentShader = parameters.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
diffuseColor.rgb = wmApplyStamp(diffuseColor.rgb, vWmPos, vWmNormal);`
        )
      } else {
        parameters.fragmentShader = parameters.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
diffuseColor.rgb = wmApplyStamp(diffuseColor.rgb, vWmPos, vWmNormal);`
        )
      }
    }
  }
  material.needsUpdate = true
}

function rebindPatchedMaterials(state: PreviewState) {
  state.generation = nextGeneration()
  state.shaders.clear()
  for (const material of state.originals.keys()) {
    material.customProgramCacheKey = () => cacheKeyFor(state)
    material.needsUpdate = true
  }
}

/**
 * Apply (or refresh) a live triplanar watermark preview on a display/inner scene graph.
 * Does not touch inspectRoot — caller must pass the cloned display graph only.
 */
export function applyTriplanarPreview(
  root: Object3D | null,
  stamp: Texture | null,
  config: WatermarkConfig | null
): void {
  if (!root) return

  if (!stamp || !config || config.intensity <= 0) {
    clearTriplanarPreview(root)
    return
  }

  const intensity = clampIntensity(config.intensity)
  const tileScale = clampTileScale(config.tileScale)
  const rotationY = Number.isFinite(config.rotationY) ? config.rotationY : 0
  const invSize = invSizeFromMaxDim(computeRootLocalMaxDim(root))
  const mode = config.mode

  let state = root.userData[USERDATA_KEY] as PreviewState | undefined
  if (!state) {
    state = {
      stamp,
      mode,
      generation: nextGeneration(),
      intensity,
      tileScale,
      rotationY,
      invSize,
      patched: new WeakSet(),
      originals: new Map(),
      shaders: new Map(),
    }
    root.userData[USERDATA_KEY] = state
  } else {
    const stampChanged = state.stamp !== stamp
    const modeChanged = state.mode !== mode
    state.stamp = stamp
    state.mode = mode
    state.intensity = intensity
    state.tileScale = tileScale
    state.rotationY = rotationY
    state.invSize = invSize

    // Mode/stamp swaps must not reuse a cached program keyed only by a constant —
    // Three.js would skip onBeforeCompile and keep a disposed / wrong stamp bound.
    if (stampChanged || modeChanged) {
      rebindPatchedMaterials(state)
    } else {
      for (const shader of state.shaders.values()) {
        pushUniforms(shader, state)
      }
    }
  }

  root.traverse(child => {
    if (!isMeshObject(child)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material || !isStandardLike(material)) continue
      if (!state!.patched.has(material)) {
        patchMaterial(material, state!)
      } else {
        const shader = state!.shaders.get(material)
        if (shader) pushUniforms(shader, state!)
      }
    }
  })
}

/** Remove preview patches and restore original onBeforeCompile handlers. */
export function clearTriplanarPreview(root: Object3D | null): void {
  if (!root) return
  const state = root.userData[USERDATA_KEY] as PreviewState | undefined
  if (!state) return

  root.traverse(child => {
    if (!isMeshObject(child)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material || !state.patched.has(material)) continue
      const original = state.originals.get(material)
      material.onBeforeCompile = original?.onBeforeCompile ?? (() => {})
      material.customProgramCacheKey =
        original?.customProgramCacheKey ?? (() => '')
      material.needsUpdate = true
    }
  })

  delete root.userData[USERDATA_KEY]
}
