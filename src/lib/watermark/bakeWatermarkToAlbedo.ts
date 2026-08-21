import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three'
import { isMeshObject } from '../isMeshObject'
import { computeGeometryMaxDim, invSizeFromMaxDim } from './bboxScale'
import { createStampTexture } from './createStampTexture'
import { TRIPLANAR_SAMPLE_FN } from './triplanarShader'
import { clampIntensity, clampTileScale, type WatermarkConfig } from './types'

const DEFAULT_MAP_SIZE = 1024
const MAX_BAKE_SIZE = 2048

export type BakeWatermarkResult = {
  bakedMaps: number
  skippedNoUv: number
  synthesizedMaps: number
}

function isStandardLike(material: Material): material is MeshStandardMaterial {
  return (
    (material as MeshStandardMaterial).isMeshStandardMaterial === true ||
    (material as { isMeshPhysicalMaterial?: boolean }).isMeshPhysicalMaterial === true
  )
}

/** Planar XZ UVs from bounding box when geometry has no uv attribute. Returns true if created. */
export function ensureGeometryUv(geometry: BufferGeometry): boolean {
  if (geometry.getAttribute('uv')) return false
  const pos = geometry.getAttribute('position')
  if (!pos || pos.count === 0) return false

  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return false
  const sx = box.max.x - box.min.x || 1
  const sz = box.max.z - box.min.z || 1
  const uvs = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = (pos.getX(i) - box.min.x) / sx
    uvs[i * 2 + 1] = (pos.getZ(i) - box.min.z) / sz
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  return true
}

function readTextureSize(texture: Texture | null): { width: number; height: number } | null {
  if (!texture?.image) return null
  const img = texture.image as {
    width?: number
    height?: number
    naturalWidth?: number
    naturalHeight?: number
  }
  const width = img.naturalWidth || img.width || 0
  const height = img.naturalHeight || img.height || 0
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function clampBakeSize(width: number, height: number): { width: number; height: number } {
  const maxDim = Math.max(width, height)
  if (maxDim <= MAX_BAKE_SIZE) return { width, height }
  const scale = MAX_BAKE_SIZE / maxDim
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function createSolidColorTexture(
  color: Color,
  size = 64,
  flipY = false
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas for solid color texture')
  ctx.fillStyle = `#${color.getHexString()}`
  ctx.fillRect(0, 0, size, size)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.flipY = flipY
  tex.needsUpdate = true
  return tex
}

function createFullscreenGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0])
  const uvs = new Float32Array([0, 0, 2, 0, 0, 2])
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  return geometry
}

function createBakeCamera(): OrthographicCamera {
  return new OrthographicCamera(-1, 1, 1, -1, -1, 1)
}

const BLIT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const BLIT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`

/** Fallback when drawImage cannot decode the source (e.g. compressed GPU-only maps). */
function blitTextureToCanvas(
  renderer: WebGLRenderer,
  texture: Texture,
  width: number,
  height: number,
  flipY: boolean
): HTMLCanvasElement {
  const rt = new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  })
  const scene = new Scene()
  const camera = createBakeCamera()
  const mat = new ShaderMaterial({
    uniforms: { tDiffuse: { value: texture } },
    vertexShader: BLIT_VERT,
    fragmentShader: BLIT_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const geo = createFullscreenGeometry()
  scene.add(new Mesh(geo, mat))

  const prevSize = new Vector2()
  renderer.getSize(prevSize)
  renderer.setSize(width, height, false)

  const prevRt = renderer.getRenderTarget()
  const prevAutoClear = renderer.autoClear
  const prevXr = renderer.xr.enabled
  renderer.xr.enabled = false
  renderer.autoClear = true
  renderer.setRenderTarget(rt)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(prevRt)
  renderer.autoClear = prevAutoClear
  renderer.xr.enabled = prevXr

  const canvas = readTargetToCanvas(renderer, rt, width, height, flipY)
  renderer.setSize(Math.max(1, prevSize.x) || 4, Math.max(1, prevSize.y) || 4, false)
  mat.dispose()
  geo.dispose()
  rt.dispose()
  return canvas
}

/**
 * Read RT into a canvas whose row order matches a top-first drawImage albedo copy.
 * glTF flipY=false: UV v=0 ↔ image top ↔ RT bottom — keep WebGL order (no CPU flip).
 * flipY=true: CPU-flip to top-first for 2D compositing.
 */
function readTargetToCanvas(
  renderer: WebGLRenderer,
  rt: WebGLRenderTarget,
  width: number,
  height: number,
  flipY: boolean
): HTMLCanvasElement {
  const buffer = new Uint8Array(width * height * 4)
  renderer.readRenderTargetPixels(rt, 0, 0, width, height, buffer)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  if (flipY) {
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width * 4
      const dstRow = y * width * 4
      imageData.data.set(buffer.subarray(srcRow, srcRow + width * 4), dstRow)
    }
  } else {
    imageData.data.set(buffer)
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Preserve encoded sRGB bytes from the source image (avoids ShaderMaterial color-space drift). */
function copyAlbedoToCanvas(
  renderer: WebGLRenderer,
  material: MeshStandardMaterial,
  width: number,
  height: number
): { canvas: HTMLCanvasElement; flipY: boolean; synthesized: boolean } {
  const size = clampBakeSize(width, height)
  if (material.map) {
    const flipY = material.map.flipY
    try {
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(material.map.image as CanvasImageSource, 0, 0, size.width, size.height)
        return { canvas, flipY, synthesized: false }
      }
    } catch {
      /* compressed / non-drawable — GPU fallback (may shift color slightly) */
    }
    return {
      canvas: blitTextureToCanvas(renderer, material.map, size.width, size.height, flipY),
      flipY,
      synthesized: false,
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `#${material.color.getHexString()}`
  ctx.fillRect(0, 0, size.width, size.height)
  return { canvas, flipY: false, synthesized: true }
}

const WM_VERT = /* glsl */ `
varying vec3 vWmPos;
varying vec3 vWmNormal;
void main() {
  vWmPos = position;
  vWmNormal = normal;
  vec2 clip = uv * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`

const WM_FRAG = /* glsl */ `
uniform sampler2D uWmStamp;
uniform float uWmIntensity;
uniform float uWmTileScale;
uniform float uWmRotationY;
uniform float uWmInvSize;
varying vec3 vWmPos;
varying vec3 vWmNormal;
${TRIPLANAR_SAMPLE_FN}
void main() {
  vec4 stamp = wmSampleTriplanar(vWmPos, vWmNormal);
  float a = stamp.a * uWmIntensity;
  gl_FragColor = vec4(stamp.rgb, a);
}
`

/** UV-space watermark only (transparent clear) — does not rewrite albedo. */
function renderWatermarkOverlay(
  renderer: WebGLRenderer,
  geometry: BufferGeometry,
  stamp: Texture,
  intensity: number,
  tileScale: number,
  rotationY: number,
  invSize: number,
  width: number,
  height: number,
  flipY: boolean
): HTMLCanvasElement {
  const rt = new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  })

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals()
  }

  const mat = new ShaderMaterial({
    uniforms: {
      uWmStamp: { value: stamp },
      uWmIntensity: { value: intensity },
      uWmTileScale: { value: tileScale },
      uWmRotationY: { value: rotationY },
      uWmInvSize: { value: invSize },
    },
    vertexShader: WM_VERT,
    fragmentShader: WM_FRAG,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
  })

  const mesh = new Mesh(geometry, mat)
  const scene = new Scene()
  scene.add(mesh)
  const camera = createBakeCamera()

  const prevSize = new Vector2()
  renderer.getSize(prevSize)
  renderer.setSize(width, height, false)

  const prevRt = renderer.getRenderTarget()
  const prevAutoClear = renderer.autoClear
  const prevClearColor = new Color()
  const prevClearAlpha = renderer.getClearAlpha()
  renderer.getClearColor(prevClearColor)
  const prevXr = renderer.xr.enabled

  renderer.xr.enabled = false
  renderer.autoClear = true
  renderer.setClearColor(0x000000, 0)
  renderer.setRenderTarget(rt)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(prevRt)
  renderer.setClearColor(prevClearColor, prevClearAlpha)
  renderer.autoClear = prevAutoClear
  renderer.xr.enabled = prevXr

  const canvas = readTargetToCanvas(renderer, rt, width, height, flipY)
  renderer.setSize(Math.max(1, prevSize.x) || 4, Math.max(1, prevSize.y) || 4, false)

  mat.dispose()
  rt.dispose()
  return canvas
}

function compositeWatermark(
  albedoCanvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = albedoCanvas.width
  out.height = albedoCanvas.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(albedoCanvas, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(overlayCanvas, 0, 0)
  return out
}

function acquireRenderer(existing?: WebGLRenderer | null): {
  renderer: WebGLRenderer
  owned: boolean
} {
  if (existing) return { renderer: existing, owned: false }
  const canvas = document.createElement('canvas')
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(4, 4, false)
  return { renderer, owned: true }
}

/**
 * Bake a triplanar watermark into every MeshStandardMaterial albedo (`map`) on `root`.
 * Albedo is drawImage-copied (sRGB-accurate); watermark is UV-rasterized then alpha-composited.
 */
export function bakeWatermarkToAlbedo(
  root: Object3D,
  config: WatermarkConfig,
  existingRenderer?: WebGLRenderer | null
): BakeWatermarkResult {
  const intensity = clampIntensity(config.intensity)
  const tileScale = clampTileScale(config.tileScale)
  const rotationY = Number.isFinite(config.rotationY) ? config.rotationY : 0

  const result: BakeWatermarkResult = {
    bakedMaps: 0,
    skippedNoUv: 0,
    synthesizedMaps: 0,
  }

  if (intensity <= 0) return result

  const stamp = createStampTexture(config)
  stamp.needsUpdate = true
  const { renderer, owned } = acquireRenderer(existingRenderer)

  const doneMaterials = new WeakSet<MeshStandardMaterial>()
  const rootInvSize = invSizeFromMaxDim(
    (() => {
      let maxDim = 0
      root.traverse(obj => {
        if (!isMeshObject(obj) || !obj.geometry) return
        maxDim = Math.max(maxDim, computeGeometryMaxDim(obj.geometry))
      })
      return maxDim > 0 ? maxDim : 1
    })()
  )

  try {
    root.traverse(child => {
      if (!isMeshObject(child)) return
      const geometry = child.geometry
      if (!geometry) return

      if (!geometry.getAttribute('uv')) {
        const created = ensureGeometryUv(geometry)
        if (!created && !geometry.getAttribute('uv')) {
          result.skippedNoUv += 1
          return
        }
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (!material || !isStandardLike(material)) continue
        if (doneMaterials.has(material)) continue
        doneMaterials.add(material)

        const srcSize = material.map
          ? readTextureSize(material.map)
          : { width: DEFAULT_MAP_SIZE, height: DEFAULT_MAP_SIZE }
        const size = clampBakeSize(
          srcSize?.width ?? DEFAULT_MAP_SIZE,
          srcSize?.height ?? DEFAULT_MAP_SIZE
        )

        const { canvas: albedoCanvas, flipY, synthesized } = copyAlbedoToCanvas(
          renderer,
          material,
          size.width,
          size.height
        )

        const overlay = renderWatermarkOverlay(
          renderer,
          geometry,
          stamp,
          intensity,
          tileScale,
          rotationY,
          rootInvSize,
          albedoCanvas.width,
          albedoCanvas.height,
          flipY
        )

        const composed = compositeWatermark(albedoCanvas, overlay)
        const baked = new CanvasTexture(composed)
        baked.colorSpace = SRGBColorSpace
        if (material.map) {
          baked.wrapS = material.map.wrapS
          baked.wrapT = material.map.wrapT
        }
        baked.flipY = flipY
        baked.premultiplyAlpha = false
        baked.needsUpdate = true

        material.map = baked
        material.color.setRGB(1, 1, 1)
        material.needsUpdate = true
        result.bakedMaps += 1
        if (synthesized) result.synthesizedMaps += 1
      }
    })
  } finally {
    stamp.dispose()
    if (owned) renderer.dispose()
  }

  return result
}
