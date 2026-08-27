import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import {
  AlwaysDepth,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  ArrowHelper,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  NeutralToneMapping,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Camera,
  WebGLRenderTarget,
  RGBAFormat,
  UnsignedByteType,
  type Material,
  type Texture,
  type ColorSpace,
} from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DEFAULT_CAMERA, type CameraSettings } from '../config/cameraDefaults'
import type { LightingSettings } from '../config/lightingDefaults'
import type { RecordingImageFormat, RecordingMode } from '../desktopTypes'
import { DEFAULT_FLATTEN_COLOR, normalizeFlattenColor } from '../lib/recordingPresets'
import {
  applyCameraSettings,
  cameraSettingsEqual,
  focusCameraOnObject,
  isViewCamera,
  readCameraSettings,
  resolveHierarchyObject,
  setOrbitElevationDegrees as applyLiveOrbitElevation,
  syncOrthoFrustum,
  viewZoomFactor,
  worldSizeFromScreenSize,
  type ViewCamera,
} from '../lib/cameraFocus'
import { configureGltfLoader, getKtx2Loader } from '../lib/configureGltfLoader'
import { configureFbxLoader } from '../lib/configureFbxLoader'
import { convertNonPbrMaterialsToPbr } from '../lib/convertToPbrMaterials'
import {
  applyClipLoop,
  bindClipAction,
  captureSeekTime,
  createAnimationMixer,
  seekAction,
  type AnimationCaptureApi,
  type AnimationPlaybackSnapshot,
  type CaptureFrameOptions,
} from '../lib/modelAnimation'
import {
  extractGeometries,
  extractMaterials,
  extractSceneInfo,
  extractTextures,
  withResolvedMeshIds,
} from '../lib/inspectScene'
import { attachResourceUrlModifier, basenameOf, type ModelSource } from '../lib/modelSource'
import { isMeshObject } from '../lib/isMeshObject'
import {
  buildSceneHierarchy,
  syncHierarchyVisibility,
  type HierarchyNode,
} from '../lib/sceneHierarchy'
import { createStudioLightScene } from '../lib/studioLightScene'
import { InfiniteGroundGrid } from './InfiniteGroundGrid'
import { HierarchyPanel } from './HierarchyPanel'
import { GeometriesPanel } from './inspect/GeometriesPanel'
import { InfoPanel } from './inspect/InfoPanel'
import { MaterialsPanel } from './inspect/MaterialsPanel'
import { TexturesPanel } from './inspect/TexturesPanel'
import { DecimatePanel } from './inspect/DecimatePanel'
import { SurfaceAnnotate, type AnnotateStroke } from './SurfaceAnnotate'
import { SurfaceMeasure, type Measurement } from './SurfaceMeasure'
import { ViewportToolOptions } from './ViewportToolOptions'
import {
  isSurfaceToolId,
  isTransformMode,
  type ViewportInteractionToolId,
} from '../lib/viewportTools'
import { TransformHistory } from '../lib/transform/transformHistory'
import type { InspectPanelId } from '../lib/inspectPanelIds'
import { ObjectTransformGizmo } from './transform/ObjectTransformGizmo'
import { useDecimateSession } from '../lib/decimate/useDecimateSession'
import { useT } from '../i18n'
import { limitObjectTextures } from '../lib/limitObjectTextures'
import {
  computeSceneHelperExtents,
  computeUnitScaleFactor,
  measureObjectSize,
  type SceneHelperExtents,
} from '../lib/modelDisplayScale'
import { ViewportToolbar } from './ViewportToolbar'
import { ViewportInfoHud } from './ViewportInfoHud'
import { AnimationPlaybackBar } from './AnimationPlaybackBar'
import {
  createNavGizmoOrientationRef,
  NavGizmoBridge,
  NavGizmoCard,
  type NavGizmoApi,
} from './NavGizmo'
import { applyShadingMode, type ShadingMode } from '../lib/shadingMode'
import {
  applyTriplanarPreview,
  clearTriplanarPreview,
  createStampTexture,
  type WatermarkConfig,
} from '../lib/watermark'
import {
  hasModelOwnLights,
  hideModelOwnCameras,
  initModelOwnLights,
  setModelOwnLightsEnabled,
} from '../lib/modelOwnRig'
import {
  sceneBgCssForTheme,
  sceneBgForTheme,
  SIMPLE_SCENE_BG_CSS,
  type PreviewTheme,
} from '../lib/previewTheme'
import { usePreviewTheme } from '../previewTheme'

type OrbitControlsLike = {
  target: Vector3
  update: () => void
  object?: Camera
}

/** @deprecated Prefer sceneBgCssForTheme — kept for callers expecting the simple theme. */
export const SCENE_BG_CSS = SIMPLE_SCENE_BG_CSS
const GROUND_COLOR = 0xcbcbcb
/** Short LMB press vs orbit-drag: time gate (orbit may move a few px before we decide). */
const CLICK_MAX_MS = 300
/** Pointer jitter allowance; real orbit is rejected via camera angle delta. */
const CLICK_MAX_MOVE_PX = 10
/** If OrbitControls azimuth/polar moved more than this, treat as drag (not pick). */
const CLICK_MAX_ORBIT_RAD = 0.008
const WIRE_COLOR = '#ec7700'
const EMPTY_CLIPS: AnimationClip[] = []

export type RecordDrive = {
  active: boolean
  radiansPerSecond: number
  onProgress: (accumulatedRad: number) => void
  onComplete: () => void
}

/** Clone scene graph with correct SkinnedMesh/Skeleton binding, then own materials. */
function deepCloneScene(source: Object3D) {
  const cloned = skeletonClone(source)
  cloned.traverse(child => {
    if (!isMeshObject(child)) return
    if (Array.isArray(child.material)) {
      child.material = child.material.map(mat => mat.clone())
    } else if (child.material) {
      child.material = child.material.clone()
    }
  })
  return cloned
}

/** Lift so the bbox rests on the ground plane (minY → 0). Does not recenter XZ. */
function placeModelOnGround(root: Object3D) {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  if (box.isEmpty()) return
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)
}

function applyEnvMapIntensity(root: Object3D | null, intensity: number) {
  if (!root) return
  root.traverse(child => {
    if (!isMeshObject(child)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of materials) {
      if (mat && 'envMapIntensity' in mat) {
        ;(mat as MeshStandardMaterial).envMapIntensity = intensity
        mat.needsUpdate = true
      }
    }
  })
}

function prepareModelMeshes(root: Object3D) {
  root.traverse(child => {
    if (isMeshObject(child)) {
      child.castShadow = false
      child.receiveShadow = false
    }
  })
}

function isWorldVisible(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

type ModelRoots = {
  /** Wrapper with unit scale + ground offset. Rendered / camera / helpers. */
  displayRoot: Object3D
  /** Skeleton clone that the AnimationMixer binds to. */
  innerRoot: Object3D
  /** Original loaded scene — materials/textures inspection only (never mutated). */
  inspectRoot: Object3D
  animations: AnimationClip[]
}

/** Clone for mixer; wrap with optional Z-up axis convert, unit normalize + feet on ground. Turntable pivot is separate. */
function prepareDisplayRoot(
  source: Object3D,
  maxTextureSize: number,
  autoNormalizeUnits: boolean,
  importAssumeZUp: boolean
): { displayRoot: Object3D; innerRoot: Object3D } {
  const innerRoot = deepCloneScene(source)
  convertNonPbrMaterialsToPbr(innerRoot)
  hideModelOwnCameras(innerRoot)
  initModelOwnLights(innerRoot)
  prepareModelMeshes(innerRoot)
  limitObjectTextures(innerRoot, maxTextureSize)

  const displayRoot = new Group()
  displayRoot.name = 'DisplayRoot'

  if (importAssumeZUp) {
    const axisConvert = new Group()
    axisConvert.name = 'AxisConvert'
    // Blender Z-up → Three.js Y-up: rotate −90° about X so +Z becomes +Y.
    axisConvert.rotation.x = -Math.PI / 2
    axisConvert.add(innerRoot)
    displayRoot.add(axisConvert)
  } else {
    displayRoot.add(innerRoot)
  }

  if (autoNormalizeUnits) {
    const { maxDim } = measureObjectSize(innerRoot)
    const factor = computeUnitScaleFactor(maxDim)
    if (factor !== 1) {
      displayRoot.scale.setScalar(factor)
      displayRoot.updateMatrixWorld(true)
    }
  }
  placeModelOnGround(displayRoot)
  return { displayRoot, innerRoot }
}

function usePublishModelRoots(
  source: Object3D,
  animations: AnimationClip[],
  onReady: () => void,
  onRootChange: (roots: ModelRoots | null) => void,
  maxTextureSize: number,
  autoNormalizeUnits: boolean,
  importAssumeZUp: boolean
) {
  const prepared = useMemo(
    () => prepareDisplayRoot(source, maxTextureSize, autoNormalizeUnits, importAssumeZUp),
    [source, maxTextureSize, autoNormalizeUnits, importAssumeZUp]
  )

  useEffect(() => {
    onRootChange({
      displayRoot: prepared.displayRoot,
      innerRoot: prepared.innerRoot,
      inspectRoot: source,
      animations,
    })
    const id = window.setTimeout(() => onReady(), 0)
    return () => {
      window.clearTimeout(id)
      onRootChange(null)
    }
  }, [prepared, source, animations, onReady, onRootChange])

  return prepared.displayRoot
}

function findMtlBlobUrl(resourceUrls: Record<string, string>): string | null {
  for (const [key, url] of Object.entries(resourceUrls)) {
    if (/\.mtl$/i.test(key) || /\.mtl$/i.test(basenameOf(key))) return url
  }
  return null
}

function LoadedGltfModel({
  mainUrl,
  resourceUrls,
  maxTextureSize,
  autoNormalizeUnits,
  importAssumeZUp,
  onReady,
  onRootChange,
}: {
  mainUrl: string
  resourceUrls: Record<string, string>
  maxTextureSize: number
  autoNormalizeUnits: boolean
  importAssumeZUp: boolean
  onReady: () => void
  onRootChange: (roots: ModelRoots | null) => void
}) {
  const gl = useThree(s => s.gl)
  const ktx2Loader = useMemo(() => getKtx2Loader(gl), [gl])
  const gltf = useLoader(GLTFLoader, mainUrl, loader => {
    configureGltfLoader(loader, { resourceUrls, ktx2Loader })
  })
  const displayRoot = usePublishModelRoots(
    gltf.scene,
    gltf.animations ?? EMPTY_CLIPS,
    onReady,
    onRootChange,
    maxTextureSize,
    autoNormalizeUnits,
    importAssumeZUp
  )
  return <primitive object={displayRoot} />
}

function LoadedObjWithMtl({
  mainUrl,
  mtlUrl,
  resourceUrls,
  maxTextureSize,
  autoNormalizeUnits,
  importAssumeZUp,
  onReady,
  onRootChange,
}: {
  mainUrl: string
  mtlUrl: string
  resourceUrls: Record<string, string>
  maxTextureSize: number
  autoNormalizeUnits: boolean
  importAssumeZUp: boolean
  onReady: () => void
  onRootChange: (roots: ModelRoots | null) => void
}) {
  const materials = useLoader(MTLLoader, mtlUrl, loader => {
    attachResourceUrlModifier(loader.manager, resourceUrls)
  })
  useLayoutEffect(() => {
    materials.preload()
  }, [materials])
  const object = useLoader(OBJLoader, mainUrl, loader => {
    attachResourceUrlModifier(loader.manager, resourceUrls)
    loader.setMaterials(materials)
  })
  const displayRoot = usePublishModelRoots(
    object,
    EMPTY_CLIPS,
    onReady,
    onRootChange,
    maxTextureSize,
    autoNormalizeUnits,
    importAssumeZUp
  )
  return <primitive object={displayRoot} />
}

function LoadedObjBare({
  mainUrl,
  resourceUrls,
  maxTextureSize,
  autoNormalizeUnits,
  importAssumeZUp,
  onReady,
  onRootChange,
}: {
  mainUrl: string
  resourceUrls: Record<string, string>
  maxTextureSize: number
  autoNormalizeUnits: boolean
  importAssumeZUp: boolean
  onReady: () => void
  onRootChange: (roots: ModelRoots | null) => void
}) {
  const object = useLoader(OBJLoader, mainUrl, loader => {
    attachResourceUrlModifier(loader.manager, resourceUrls)
  })
  const displayRoot = usePublishModelRoots(
    object,
    EMPTY_CLIPS,
    onReady,
    onRootChange,
    maxTextureSize,
    autoNormalizeUnits,
    importAssumeZUp
  )
  return <primitive object={displayRoot} />
}

function LoadedFbxModel({
  mainUrl,
  resourceUrls,
  maxTextureSize,
  autoNormalizeUnits,
  importAssumeZUp,
  onReady,
  onRootChange,
}: {
  mainUrl: string
  resourceUrls: Record<string, string>
  maxTextureSize: number
  autoNormalizeUnits: boolean
  importAssumeZUp: boolean
  onReady: () => void
  onRootChange: (roots: ModelRoots | null) => void
}) {
  const object = useLoader(FBXLoader, mainUrl, loader => {
    configureFbxLoader(loader, resourceUrls)
  })
  const displayRoot = usePublishModelRoots(
    object,
    object.animations ?? EMPTY_CLIPS,
    onReady,
    onRootChange,
    maxTextureSize,
    autoNormalizeUnits,
    importAssumeZUp
  )
  return <primitive object={displayRoot} />
}

function LoadedModel({
  model,
  maxTextureSize,
  autoNormalizeUnits,
  importAssumeZUp,
  onReady,
  onRootChange,
}: {
  model: ModelSource
  maxTextureSize: number
  autoNormalizeUnits: boolean
  importAssumeZUp: boolean
  onReady: () => void
  onRootChange: (roots: ModelRoots | null) => void
}) {
  if (model.format === 'obj') {
    const mtlUrl = findMtlBlobUrl(model.resourceUrls)
    if (mtlUrl) {
      return (
        <LoadedObjWithMtl
          mainUrl={model.mainUrl}
          mtlUrl={mtlUrl}
          resourceUrls={model.resourceUrls}
          maxTextureSize={maxTextureSize}
          autoNormalizeUnits={autoNormalizeUnits}
          importAssumeZUp={importAssumeZUp}
          onReady={onReady}
          onRootChange={onRootChange}
        />
      )
    }
    return (
      <LoadedObjBare
        mainUrl={model.mainUrl}
        resourceUrls={model.resourceUrls}
        maxTextureSize={maxTextureSize}
        autoNormalizeUnits={autoNormalizeUnits}
        importAssumeZUp={importAssumeZUp}
        onReady={onReady}
        onRootChange={onRootChange}
      />
    )
  }

  if (model.format === 'fbx') {
    return (
      <LoadedFbxModel
        mainUrl={model.mainUrl}
        resourceUrls={model.resourceUrls}
        maxTextureSize={maxTextureSize}
        autoNormalizeUnits={autoNormalizeUnits}
        importAssumeZUp={importAssumeZUp}
        onReady={onReady}
        onRootChange={onRootChange}
      />
    )
  }

  if (model.format === 'glb' || model.format === 'gltf') {
    return (
      <LoadedGltfModel
        mainUrl={model.mainUrl}
        resourceUrls={model.resourceUrls}
        maxTextureSize={maxTextureSize}
        autoNormalizeUnits={autoNormalizeUnits}
        importAssumeZUp={importAssumeZUp}
        onReady={onReady}
        onRootChange={onRootChange}
      />
    )
  }

  return null
}

/** Wireframe overlay + RGB origin axes — mirrors glb-viewer-core selection visuals. */
function SelectionOverlay({
  object,
  showAxes = true,
}: {
  object: Object3D | null
  showAxes?: boolean
}) {
  const { camera, size } = useThree()
  const rootRef = useRef<Group>(null)
  const wireRef = useRef<Mesh | null>(null)
  const axesRef = useRef<Object3D | null>(null)
  const wireMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: WIRE_COLOR,
        wireframe: true,
        depthTest: false,
        depthFunc: AlwaysDepth,
        depthWrite: false,
        transparent: true,
        opacity: 0.5,
      }),
    []
  )

  useEffect(() => {
    return () => {
      wireMaterial.dispose()
    }
  }, [wireMaterial])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    while (root.children.length) {
      root.remove(root.children[0])
    }
    wireRef.current = null
    axesRef.current = null

    if (!object) return

    if (isMeshObject(object) && object.geometry) {
      const wire = new Mesh(object.geometry as BufferGeometry, wireMaterial)
      wire.renderOrder = 500
      wire.userData.__hierarchyIgnore = true
      wire.frustumCulled = false
      root.add(wire)
      wireRef.current = wire
    }

    if (showAxes) {
      const axes = new Object3D()
      axes.userData.__hierarchyIgnore = true
      const makeArrow = (dir: Vector3, color: string) => {
        const arrow = new ArrowHelper(dir, new Vector3(0, 0, 0), 1, color)
        arrow.traverse(child => {
          if (isMeshObject(child) || (child as { material?: Material }).material) {
            const mat = (child as Mesh).material as MeshBasicMaterial | undefined
            if (mat) {
              mat.depthTest = false
              mat.depthFunc = AlwaysDepth
            }
            child.renderOrder = 99999
          }
        })
        return arrow
      }
      axes.add(makeArrow(new Vector3(1, 0, 0), '#EA334C'))
      axes.add(makeArrow(new Vector3(0, 1, 0), '#80CA1E'))
      axes.add(makeArrow(new Vector3(0, 0, 1), '#2D83E8'))
      root.add(axes)
      axesRef.current = axes
    }
  }, [object, wireMaterial, showAxes])

  useFrame(() => {
    if (!object || !isViewCamera(camera)) return
    const wire = wireRef.current
    const axes = axesRef.current

    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    object.getWorldPosition(position)
    object.getWorldQuaternion(quaternion)
    object.getWorldScale(scale)

    if (wire) {
      wire.position.copy(position)
      wire.quaternion.copy(quaternion)
      wire.scale.copy(scale)
    }

    if (axes) {
      axes.position.copy(position)
      axes.quaternion.copy(quaternion)
      const axisScale = worldSizeFromScreenSize(100, position, camera, size.height)
      axes.scale.setScalar(axisScale)
    }
  })

  return <group ref={rootRef} />
}

function SelectionFocuser({
  object,
  focusToken,
  enabled,
  onCameraSettled,
}: {
  object: Object3D | null
  focusToken: number
  enabled: boolean
  onCameraSettled?: () => void
}) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as OrbitControlsLike | null

  useEffect(() => {
    if (!enabled || !object || focusToken <= 0) return
    if (!isViewCamera(camera)) return
    focusCameraOnObject(object, camera, controls)
    onCameraSettled?.()
  }, [object, focusToken, enabled, camera, controls, onCameraSettled])

  return null
}

/** Fit camera to the full model when a new display root appears. */
function InitialModelFitter({
  modelRoot,
  onCameraSettled,
}: {
  modelRoot: Object3D | null
  onCameraSettled?: () => void
}) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as OrbitControlsLike | null

  useLayoutEffect(() => {
    if (!modelRoot || !controls) return
    if (!isViewCamera(camera)) return
    focusCameraOnObject(modelRoot, camera, controls)
    onCameraSettled?.()
  }, [modelRoot, camera, controls, onCameraSettled])

  return null
}

type OrbitAngleControls = {
  getAzimuthalAngle?: () => number
  getPolarAngle?: () => number
}

function readOrbitAngles(controls: unknown): { azimuth: number; polar: number } | null {
  const orbit = controls as OrbitAngleControls | null
  if (!orbit || typeof orbit.getAzimuthalAngle !== 'function' || typeof orbit.getPolarAngle !== 'function') {
    return null
  }
  return { azimuth: orbit.getAzimuthalAngle(), polar: orbit.getPolarAngle() }
}

function ClickPicker({
  enabled,
  modelRoot,
  onPick,
}: {
  enabled: boolean
  modelRoot: Object3D | null
  onPick: (object: Object3D | null) => void
}) {
  const { camera, gl, controls } = useThree()
  const downAtRef = useRef(0)
  const downPosRef = useRef({ x: 0, y: 0 })
  const downOrbitRef = useRef<{ azimuth: number; polar: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    const element = gl.domElement

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      downAtRef.current = Date.now()
      downPosRef.current = { x: event.clientX, y: event.clientY }
      downOrbitRef.current = readOrbitAngles(controls)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (Date.now() - downAtRef.current >= CLICK_MAX_MS) return
      const dx = event.clientX - downPosRef.current.x
      const dy = event.clientY - downPosRef.current.y
      if (dx * dx + dy * dy > CLICK_MAX_MOVE_PX * CLICK_MAX_MOVE_PX) return

      const downOrbit = downOrbitRef.current
      const upOrbit = readOrbitAngles(controls)
      if (downOrbit && upOrbit) {
        const dAz = Math.abs(upOrbit.azimuth - downOrbit.azimuth)
        const dPol = Math.abs(upOrbit.polar - downOrbit.polar)
        if (dAz > CLICK_MAX_ORBIT_RAD || dPol > CLICK_MAX_ORBIT_RAD) return
      }

      if (!modelRoot) {
        onPick(null)
        return
      }

      const rect = element.getBoundingClientRect()
      const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      const raycaster = new Raycaster()
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(modelRoot, true)
      const hit = hits.find(entry => isWorldVisible(entry.object))
      onPick(hit ? resolveHierarchyObject(hit.object) : null)
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointerup', onPointerUp)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointerup', onPointerUp)
    }
  }, [enabled, modelRoot, camera, gl, controls, onPick])

  return null
}

class ModelLoadErrorBoundary extends Component<
  { resetKey: string; onError: (message: string) => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || 'Failed to load model.')
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function createContactShadowTexture(): CanvasTexture | null {
  const texSize = 256
  const canvas = document.createElement('canvas')
  canvas.width = texSize
  canvas.height = texSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createRadialGradient(
    texSize / 2,
    texSize / 2,
    0,
    texSize / 2,
    texSize / 2,
    texSize / 2
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0.38)')
  gradient.addColorStop(0.35, 'rgba(0,0,0,0.16)')
  gradient.addColorStop(0.7, 'rgba(0,0,0,0.05)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, texSize, texSize)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  return map
}

/** White radial gradient for grayscale mask contact shadow on black background. */
function createMaskContactShadowTexture(): CanvasTexture | null {
  const texSize = 256
  const canvas = document.createElement('canvas')
  canvas.width = texSize
  canvas.height = texSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createRadialGradient(
    texSize / 2,
    texSize / 2,
    0,
    texSize / 2,
    texSize / 2,
    texSize / 2
  )
  gradient.addColorStop(0, 'rgba(255,255,255,0.38)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.16)')
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.05)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, texSize, texSize)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  return map
}

type MaskMaterialEntry = {
  original: Material | Material[]
  mask: MeshBasicMaterial
}

const maskMaterialCache = new WeakMap<Mesh, MaskMaterialEntry>()

function applyMaskMaterials(root: Object3D | null) {
  if (!root) return
  root.traverse(obj => {
    if (!isMeshObject(obj) || !obj.geometry) return
    let entry = maskMaterialCache.get(obj)
    if (!entry) {
      entry = { original: obj.material, mask: new MeshBasicMaterial({ color: 0xffffff }) }
      maskMaterialCache.set(obj, entry)
    }
    obj.material = entry.mask
  })
}

function restoreMaskMaterials(root: Object3D | null) {
  if (!root) return
  root.traverse(obj => {
    if (!isMeshObject(obj)) return
    const entry = maskMaterialCache.get(obj)
    if (entry) obj.material = entry.original
  })
}

function Ground({ size }: { size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial color={GROUND_COLOR} depthWrite={false} />
    </mesh>
  )
}

function ProfessionalFloor({ fadeDistance }: { fadeDistance: number }) {
  return <InfiniteGroundGrid fadeDistance={fadeDistance} />
}

function SoftContactShadow({ size }: { size: number }) {
  const texture = useMemo(() => createContactShadowTexture(), [])

  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  if (!texture) return null

  // Keep the slight offset from the original meter-scale shadow relative to size.
  const offsetScale = size / 2.4
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0.05 * offsetScale, 0.001, 0.06 * offsetScale]}
      scale={[1.55, 1, 1.05]}
      renderOrder={-1}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

/** Mask-only contact shadow: white gradient on black, toggled visible during mask capture. */
function MaskContactShadow({
  size,
  meshRef,
}: {
  size: number
  meshRef: MutableRefObject<Mesh | null>
}) {
  const texture = useMemo(() => createMaskContactShadowTexture(), [])

  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  if (!texture) return null

  const offsetScale = size / 2.4
  return (
    <mesh
      ref={meshRef}
      visible={false}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0.05 * offsetScale, 0.001, 0.06 * offsetScale]}
      scale={[1.55, 1, 1.05]}
      renderOrder={-1}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial color={0xffffff} map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

function SceneLighting({
  settings,
  modelRoot,
  previewTheme,
  fogNear,
  fogFar,
  noExportBackground,
  captureFlatten,
  exportFlattenColor,
}: {
  settings: LightingSettings
  modelRoot: Object3D | null
  previewTheme: PreviewTheme
  fogNear: number
  fogFar: number
  noExportBackground: boolean
  /** Video / JPEG-no-bg: background must become opaque and flattened. */
  captureFlatten: boolean
  exportFlattenColor: string
}) {
  const { gl, scene } = useThree()
  const pmremRef = useRef<PMREMGenerator | null>(null)
  const envTexRef = useRef<Texture | null>(null)
  const sceneBg = sceneBgForTheme(previewTheme)

  useLayoutEffect(() => {
    if (noExportBackground) {
      scene.background = null
      scene.fog = null
      // Opaque flatten (Video/JPEG) vs true transparent clear (PNG/WebP).
      gl.setClearColor(captureFlatten ? exportFlattenColor : 0x000000, captureFlatten ? 1 : 0)
    } else {
      scene.background = new Color(sceneBg)
      scene.fog =
        previewTheme === 'professional' ? null : new Fog(sceneBg, fogNear, fogFar)
      gl.setClearColor(sceneBg, 1)
    }
    gl.outputColorSpace = SRGBColorSpace
    gl.toneMapping = NeutralToneMapping
    gl.toneMappingExposure = settings.exposure
    gl.shadowMap.enabled = false

    if (envTexRef.current) {
      envTexRef.current.dispose()
      envTexRef.current = null
    }
    scene.environment = null

    if (settings.mode === 'studio') {
      if (!pmremRef.current) {
        pmremRef.current = new PMREMGenerator(gl)
      }
      const envTexture = pmremRef.current.fromScene(createStudioLightScene()).texture
      envTexRef.current = envTexture
      scene.environment = envTexture
    }

    applyEnvMapIntensity(modelRoot, settings.envIntensity)
  }, [
    gl,
    scene,
    settings.mode,
    settings.exposure,
    settings.envIntensity,
    modelRoot,
    previewTheme,
    sceneBg,
    noExportBackground,
    captureFlatten,
    exportFlattenColor,
    fogNear,
    fogFar,
  ])

  useEffect(() => {
    return () => {
      if (envTexRef.current) {
        envTexRef.current.dispose()
        envTexRef.current = null
      }
      if (pmremRef.current) {
        pmremRef.current.dispose()
        pmremRef.current = null
      }
      scene.environment = null
      scene.fog = null
    }
  }, [scene])

  if (settings.mode === 'classic') {
    return (
      <>
        <hemisphereLight args={[0xffffff, 0x8d8d8d, 1.35]} position={[0, 8, 0]} />
        <directionalLight intensity={0.28} position={[-2.5, 5, 3]} color="#ffffff" />
      </>
    )
  }

  if (settings.mode === 'neutral') {
    return <ambientLight intensity={0.9} color="#ffffff" />
  }

  if (settings.mode === 'rendered') {
    // Model's own lights drive the scene. When the model has no embedded lights
    // add a very dim ambient so the scene isn't pitch-black.
    const haslights = hasModelOwnLights(modelRoot)
    return haslights ? null : <ambientLight intensity={0.3} color="#ffffff" />
  }

  // Studio: IBL only (glb-viewer-core style)
  return null
}

/**
 * Turntable parent for offline capture. Rotates around the model bbox center via an
 * independent pivot so the mesh stays feet-on-ground (same framing in viewport + export).
 */
function TurntableGroup({
  recording,
  modelRoot,
  children,
  groupRefOut,
}: {
  recording: boolean
  modelRoot: Object3D | null
  children: ReactNode
  groupRefOut?: MutableRefObject<Group | null>
}) {
  const groupRef = useRef<Group>(null)
  const [pivot, setPivot] = useState({ x: 0, y: 0, z: 0 })

  useEffect(() => {
    if (groupRefOut) groupRefOut.current = groupRef.current
  })

  useLayoutEffect(() => {
    if (!modelRoot) {
      setPivot(prev => (prev.x === 0 && prev.y === 0 && prev.z === 0 ? prev : { x: 0, y: 0, z: 0 }))
      return
    }
    modelRoot.updateMatrixWorld(true)
    const box = new Box3().setFromObject(modelRoot)
    if (box.isEmpty()) {
      setPivot(prev => (prev.x === 0 && prev.y === 0 && prev.z === 0 ? prev : { x: 0, y: 0, z: 0 }))
      return
    }
    const center = box.getCenter(new Vector3())
    setPivot(prev =>
      Math.abs(prev.x - center.x) < 1e-6 &&
      Math.abs(prev.y - center.y) < 1e-6 &&
      Math.abs(prev.z - center.z) < 1e-6
        ? prev
        : { x: center.x, y: center.y, z: center.z }
    )
  }, [modelRoot])

  useEffect(() => {
    if (groupRef.current) groupRef.current.rotation.y = 0
  }, [recording])

  return (
    <group ref={groupRef} position={[pivot.x, pivot.y, pivot.z]}>
      <group position={[-pivot.x, -pivot.y, -pivot.z]}>{children}</group>
    </group>
  )
}

function CanvasBridge({ onCanvasReady }: { onCanvasReady: (canvas: HTMLCanvasElement | null) => void }) {
  const gl = useThree(s => s.gl)
  const onCanvasReadyRef = useRef(onCanvasReady)
  onCanvasReadyRef.current = onCanvasReady

  useEffect(() => {
    onCanvasReadyRef.current(gl.domElement)
    return () => onCanvasReadyRef.current(null)
  }, [gl])

  return null
}

/**
 * Softens hard alpha-channel edges in place with a small separable box blur.
 * RGB channels are left untouched so the true foreground color is preserved
 * at partially-transparent edge pixels (avoids a dark halo from blurring
 * toward the cleared black-transparent background).
 */
function drawWatermarkOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number
): void {
  const fontSize = Math.max(12, width * 0.04)
  ctx.save()
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(width / 2, height / 2)
  ctx.rotate(-Math.PI / 6)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

function featherAlphaChannel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  if (radius <= 0 || width <= 0 || height <= 0) return
  const count = width * height
  const src = new Float32Array(count)
  for (let i = 0; i < count; i++) src[i] = data[i * 4 + 3]
  const tmp = new Float32Array(count)
  const kernelSize = radius * 2 + 1

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k))
        sum += src[rowOffset + xx]
      }
      tmp[rowOffset + x] = sum / kernelSize
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k))
        sum += tmp[yy * width + x]
      }
      data[(y * width + x) * 4 + 3] = Math.round(sum / kernelSize)
    }
  }
}

/** Provides fixed-step offline capture capability via ref. */
function CaptureBridge({
  turntableGroupRef,
  captureRef,
  captureNeedsAlpha,
  captureFlatten,
  exportFlattenColor,
  maskShadowMeshRef,
  exportHelpersRef,
  exportMask,
  recording,
  animationApiRef,
  watermarkText,
}: {
  turntableGroupRef: MutableRefObject<Group | null>
  captureRef: MutableRefObject<CaptureHandle | null>
  captureNeedsAlpha: boolean
  captureFlatten: boolean
  exportFlattenColor: string
  maskShadowMeshRef: MutableRefObject<Mesh | null>
  exportHelpersRef: MutableRefObject<Group | null>
  exportMask: boolean
  recording: boolean
  animationApiRef: MutableRefObject<AnimationCaptureApi | null>
  watermarkText?: string | null
}) {
  const { gl, scene, camera } = useThree()
  const controls = useThree(s => s.controls) as OrbitControlsLike | null
  const captureAnimSnapRef = useRef<AnimationPlaybackSnapshot | null>(null)

  useLayoutEffect(() => {
    const api = animationApiRef.current
    if (!recording) {
      api?.setLiveEnabled(true)
      return
    }
    captureAnimSnapRef.current = api?.snapshot() ?? null
    api?.setLiveEnabled(false)
    return () => {
      const snap = captureAnimSnapRef.current
      if (snap) animationApiRef.current?.restore(snap)
      animationApiRef.current?.setLiveEnabled(true)
      captureAnimSnapRef.current = null
    }
  }, [recording, animationApiRef])

  // useLayoutEffect: capture API must match alpha mode before paint / before App resumes after recording:true.
  useLayoutEffect(() => {
    const captureFrameInternal = (
      rotationY: number,
      outputSize: { width: number; height: number },
      renderScale: number,
      options: {
        stageAlphaEnabled: boolean
        /**
         * Render to an offscreen RGBA target and read pixels.
         * Avoids default framebuffer alpha/MSAA issues that turn clears into opaque black.
         */
        useAlphaRenderTarget?: boolean
        preFill?: string
        prepareScene?: () => void
        restoreScene?: () => void
        capture?: CaptureFrameOptions
      }
    ): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const prevPixelRatio = gl.getPixelRatio()
        const prevSize = new Vector2()
        gl.getSize(prevSize)
        const prevRenderTarget = gl.getRenderTarget()
        let alphaTarget: WebGLRenderTarget | null = null
        try {
          const cap = options.capture
          const snap = captureAnimSnapRef.current
          if (cap && cap.frameIndex != null && cap.fps != null && snap?.playing) {
            animationApiRef.current?.seekCapture(snap, cap.frameIndex, cap.fps)
          }

          const root = turntableGroupRef.current
          if (root) root.rotation.y = rotationY

          options.prepareScene?.()

          const tw = outputSize.width
          const th = outputSize.height
          const sourceAspect = prevSize.x / Math.max(prevSize.y, 1)
          const targetAspect = tw / Math.max(th, 1)
          let rw = tw
          let rh = th
          if (sourceAspect > targetAspect) {
            rh = th
            rw = Math.max(tw, Math.round(th * sourceAspect))
          } else if (sourceAspect < targetAspect) {
            rw = tw
            rh = Math.max(th, Math.round(tw / Math.max(sourceAspect, 0.001)))
          }

          // Transparent (alpha render-target) captures have hard 0/255 alpha edges with
          // no GPU MSAA available (three.js classic WebGLRenderer ignores `samples` on
          // custom render targets), so force modest extra supersampling to smooth
          // silhouette edges regardless of the user's selected quality/renderScale.
          // A light alpha-channel feather pass (below) does the rest of the AA work
          // cheaply, so we don't need a large (and costly) supersample factor here.
          // Clamp against the GPU's *real* max texture size — planCapture only vetted
          // the un-boosted scale, and the old hardcoded 4096 cap silently defeated this
          // boost for large (e.g. 4K) export sizes.
          const MIN_ALPHA_SSAA = 1.5
          let ssaa = options.useAlphaRenderTarget
            ? Math.max(renderScale, MIN_ALPHA_SSAA)
            : Math.max(1, renderScale)
          if (options.useAlphaRenderTarget) {
            const maxTexture = gl.capabilities.maxTextureSize
            const safeMaxDim = Math.max(1024, Math.floor(maxTexture * 0.92))
            const largestDim = Math.max(rw, rh) * ssaa
            if (largestDim > safeMaxDim) {
              ssaa = Math.max(1, ssaa * (safeMaxDim / largestDim))
            }
          }
          const renderW = Math.round(rw * ssaa)
          const renderH = Math.round(rh * ssaa)

          const stage = document.createElement('canvas')
          stage.width = tw
          stage.height = th
          const ctx = stage.getContext('2d', { alpha: options.stageAlphaEnabled }) as
            | CanvasRenderingContext2D
            | null
          if (!ctx) {
            reject(new Error('Failed to get 2D context for capture'))
            return
          }
          const cropW = Math.round(tw * ssaa)
          const cropH = Math.round(th * ssaa)
          const sx = Math.max(0, Math.floor((renderW - cropW) / 2))
          const syTop = Math.max(0, Math.floor((renderH - cropH) / 2))
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'

          if (options.useAlphaRenderTarget) {
            alphaTarget = new WebGLRenderTarget(renderW, renderH, {
              format: RGBAFormat,
              type: UnsignedByteType,
              colorSpace: gl.outputColorSpace as ColorSpace,
              depthBuffer: true,
              stencilBuffer: false,
              // Classic WebGLRenderer does not implement MSAA for custom render
              // targets (samples is a no-op here); edge AA comes from the forced
              // supersampling above (MIN_ALPHA_SSAA) instead.
              samples: 0,
            })
            gl.setRenderTarget(alphaTarget)
            gl.setClearColor(0x000000, 0)
            gl.clear(true, true, true)
            gl.render(scene, camera)

            const pixels = new Uint8Array(renderW * renderH * 4)
            gl.readRenderTargetPixels(alphaTarget, 0, 0, renderW, renderH, pixels)
            gl.setRenderTarget(prevRenderTarget)

            const raw = document.createElement('canvas')
            raw.width = renderW
            raw.height = renderH
            const rawCtx = raw.getContext('2d', { alpha: true })
            if (!rawCtx) {
              reject(new Error('Failed to get 2D context for alpha render target'))
              return
            }
            const imageData = rawCtx.createImageData(renderW, renderH)
            const rowBytes = renderW * 4
            // WebGL origin is bottom-left; canvas ImageData is top-left.
            for (let y = 0; y < renderH; y++) {
              const srcOffset = (renderH - 1 - y) * rowBytes
              const dstOffset = y * rowBytes
              imageData.data.set(pixels.subarray(srcOffset, srcOffset + rowBytes), dstOffset)
            }
            rawCtx.putImageData(imageData, 0, 0)
            ctx.clearRect(0, 0, tw, th)
            ctx.drawImage(raw, sx, syTop, cropW, cropH, 0, 0, tw, th)

            // Cheap resolution-independent AA pass: soften the hard 0/255 alpha edges
            // left over after downsampling. Only the alpha channel is blurred — RGB is
            // left untouched so semi-transparent edge pixels keep the true foreground
            // color instead of darkening toward the (black) cleared background.
            const finalFrame = ctx.getImageData(0, 0, tw, th)
            featherAlphaChannel(finalFrame.data, tw, th, 1)
            ctx.putImageData(finalFrame, 0, 0)
          } else {
            gl.setPixelRatio(1)
            gl.setSize(renderW, renderH, false)
            gl.render(scene, camera)
            gl.getContext().finish()

            if (options.preFill) {
              ctx.fillStyle = options.preFill
              ctx.fillRect(0, 0, tw, th)
            }
            ctx.drawImage(gl.domElement, sx, syTop, cropW, cropH, 0, 0, tw, th)
          }

          if (watermarkText) {
            drawWatermarkOnCanvas(ctx, watermarkText, tw, th)
          }

          stage.toBlob(
            blob => {
              if (!blob) {
                reject(new Error('toBlob failed'))
                return
              }
              blob.arrayBuffer().then(resolve).catch(reject)
            },
            'image/png'
          )
        } catch (err) {
          reject(err)
        } finally {
          options.restoreScene?.()
          if (alphaTarget) {
            gl.setRenderTarget(prevRenderTarget)
            alphaTarget.dispose()
          }
          if (!options.useAlphaRenderTarget) {
            gl.setPixelRatio(prevPixelRatio)
            gl.setSize(prevSize.x, prevSize.y, false)
          }
        }
      })
    }

    captureRef.current = {
      /**
       * Apply orbit elevation during recording. Uses live camera radius/azimuth
       * unless `baseSettings` is provided (preferred for multi-axis batches so
       * each pitch starts from the same freeze-frame pose).
       */
      setOrbitElevationDegrees: (elevationDeg: number, baseSettings?: CameraSettings) => {
        if (!isViewCamera(camera)) return
        if (baseSettings) {
          applyCameraSettings(camera, controls, baseSettings)
        }
        applyLiveOrbitElevation(camera, controls, elevationDeg)
      },
      /** Restore a full CameraSettings pose (e.g. after multi-axis batch). */
      applyCameraPose: (settings: CameraSettings) => {
        if (!isViewCamera(camera)) return
        applyCameraSettings(camera, controls, settings)
      },
      planCapture: (
        outputSize: { width: number; height: number },
        renderScale: number
      ): {
        outputSize: { width: number; height: number }
        renderScale: number
        adjusted: boolean
        reason?: string
      } => {
        const prevSize = new Vector2()
        gl.getSize(prevSize)

        const sourceAspect = prevSize.x / Math.max(prevSize.y, 1)
        const targetAspect = outputSize.width / Math.max(outputSize.height, 1)
        const maxTexture = gl.capabilities.maxTextureSize
        const hardCap = 4096
        // Keep safety headroom to avoid unstable reads near HW/driver limits.
        const safeMaxDim = Math.max(1024, Math.min(hardCap, Math.floor(maxTexture * 0.85)))

        const resolveCoverRenderSize = (width: number, height: number) => {
          let rw = width
          let rh = height
          if (sourceAspect > targetAspect) {
            rh = height
            rw = Math.max(width, Math.round(height * sourceAspect))
          } else if (sourceAspect < targetAspect) {
            rw = width
            rh = Math.max(height, Math.round(width / Math.max(sourceAspect, 0.001)))
          }
          return { rw, rh }
        }

        const fitForScale = (width: number, height: number, scale: number) => {
          const { rw, rh } = resolveCoverRenderSize(width, height)
          return Math.max(Math.round(rw * scale), Math.round(rh * scale))
        }

        const requestedScale = Math.max(1, renderScale)
        const scaleCandidates = Array.from(
          new Set([requestedScale, 1.5, 1].filter(v => v >= 1 && v <= requestedScale))
        ).sort((a, b) => b - a)
        const dims = {
          width: outputSize.width,
          height: outputSize.height,
        }

        let fitsCurrentSize = false
        for (const candidate of scaleCandidates) {
          if (fitForScale(dims.width, dims.height, candidate) <= safeMaxDim) {
            fitsCurrentSize = true
            break
          }
        }

        // If still too large, reduce output size while preserving requested aspect.
        if (!fitsCurrentSize) {
          const baseMax = fitForScale(dims.width, dims.height, 1)
          if (baseMax > safeMaxDim) {
            const shrink = Math.max(0.1, safeMaxDim / baseMax)
            dims.width = Math.max(2, Math.floor((dims.width * shrink) / 2) * 2)
            dims.height = Math.max(2, Math.floor((dims.height * shrink) / 2) * 2)
          }
        }

        let chosenAfterResize = 1
        for (const candidate of scaleCandidates) {
          if (fitForScale(dims.width, dims.height, candidate) <= safeMaxDim) {
            chosenAfterResize = candidate
            break
          }
        }

        const adjusted =
          chosenAfterResize !== requestedScale ||
          dims.width !== outputSize.width ||
          dims.height !== outputSize.height
        const reason = adjusted
          ? `Auto-adjusted recording for GPU stability (max texture ${maxTexture}, cap ${hardCap}, safe ${safeMaxDim}px).`
          : undefined

        return {
          outputSize: dims,
          renderScale: chosenAfterResize,
          adjusted,
          reason,
        }
      },
      captureFrame: (
        rotationY: number,
        outputSize: { width: number; height: number },
        renderScale = 1,
        capture?: CaptureFrameOptions
      ): Promise<ArrayBuffer> => {
        if (captureNeedsAlpha) {
          const prevClear = new Color()
          gl.getClearColor(prevClear)
          const prevClearAlpha = gl.getClearAlpha()
          const prevBackground = scene.background
          const prevFog = scene.fog
          const helpers = exportHelpersRef.current
          const prevHelpersVisible = helpers ? helpers.visible : true
          return captureFrameInternal(rotationY, outputSize, renderScale, {
            stageAlphaEnabled: true,
            useAlphaRenderTarget: true,
            capture,
            prepareScene: () => {
              scene.background = null
              scene.fog = null
              if (helpers) helpers.visible = false
              gl.setClearColor(0x000000, 0)
            },
            restoreScene: () => {
              scene.background = prevBackground
              scene.fog = prevFog
              if (helpers) helpers.visible = prevHelpersVisible
              gl.setClearColor(prevClear, prevClearAlpha)
            },
          })
        }
        return captureFrameInternal(rotationY, outputSize, renderScale, {
          stageAlphaEnabled: false,
          preFill: captureFlatten ? exportFlattenColor : '#000',
          capture,
        })
      },
      captureMaskFrame: exportMask
        ? (
            rotationY: number,
            outputSize: { width: number; height: number },
            renderScale = 1,
            capture?: CaptureFrameOptions
          ): Promise<ArrayBuffer> => {
            const prevClear = new Color()
            gl.getClearColor(prevClear)
            const prevClearAlpha = gl.getClearAlpha()
            const prevEnvironment = scene.environment
            const prevBackground = scene.background
            const prevFog = scene.fog
            const helpers = exportHelpersRef.current
            const prevHelpersVisible = helpers ? helpers.visible : true
            return captureFrameInternal(rotationY, outputSize, renderScale, {
              stageAlphaEnabled: false,
              preFill: '#000000',
              capture,
              prepareScene: () => {
                applyMaskMaterials(turntableGroupRef.current)
                const maskMesh = maskShadowMeshRef.current
                if (maskMesh) maskMesh.visible = true
                scene.environment = null
                scene.background = null
                scene.fog = null
                if (helpers) helpers.visible = false
                gl.setClearColor(0x000000, 1)
              },
              restoreScene: () => {
                restoreMaskMaterials(turntableGroupRef.current)
                const maskMesh = maskShadowMeshRef.current
                if (maskMesh) maskMesh.visible = false
                scene.environment = prevEnvironment
                scene.background = prevBackground
                scene.fog = prevFog
                if (helpers) helpers.visible = prevHelpersVisible
                gl.setClearColor(prevClear, prevClearAlpha)
              },
            })
          }
        : undefined,
    }

    return () => {
      captureRef.current = null
    }
  }, [
    gl,
    scene,
    camera,
    controls,
    turntableGroupRef,
    captureRef,
    captureFlatten,
    captureNeedsAlpha,
    exportFlattenColor,
    maskShadowMeshRef,
    exportHelpersRef,
    exportMask,
    animationApiRef,
    watermarkText,
  ])

  return null
}

/**
 * Reads live camera into panel settings (viewport → panel), with dedupe.
 * Must run inside the R3F Canvas tree.
 */
function useViewportCameraPublisher(
  syncSourceRef: MutableRefObject<'panel' | 'viewport'>,
  cameraSettingsRef: MutableRefObject<CameraSettings>,
  onCameraSettingsChangeRef: MutableRefObject<((next: CameraSettings) => void) | undefined>
) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as OrbitControlsLike | null

  return useCallback(() => {
    if (!isViewCamera(camera)) return
    const next = readCameraSettings(camera, controls, cameraSettingsRef.current)
    if (cameraSettingsEqual(next, cameraSettingsRef.current)) return
    syncSourceRef.current = 'viewport'
    onCameraSettingsChangeRef.current?.(next)
  }, [camera, controls, syncSourceRef, cameraSettingsRef, onCameraSettingsChangeRef])
}

function syncActiveFrustum(camera: ViewCamera, controls: OrbitControlsLike | null, fov: number, aspect: number) {
  if (camera instanceof OrthographicCamera) {
    const distance = controls ? Math.max(camera.position.distanceTo(controls.target), 0.001) : 1
    syncOrthoFrustum(camera, fov, distance, aspect)
  }
  camera.updateProjectionMatrix()
}

/**
 * Owns perspective + orthographic cameras, swaps R3F default on projection
 * change, and applies panel camera settings. Skips pose writebacks from the viewport.
 */
function CameraRig({
  cameraSettings,
  recording,
  syncSourceRef,
}: {
  cameraSettings: CameraSettings
  recording: boolean
  syncSourceRef: MutableRefObject<'panel' | 'viewport'>
}) {
  const set = useThree(s => s.set)
  const get = useThree(s => s.get)
  const size = useThree(s => s.size)
  const persp = useMemo(() => new PerspectiveCamera(DEFAULT_CAMERA.fov, 1, 0.1, 100), [])
  const ortho = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0.1, 100), [])
  const appliedRef = useRef<CameraSettings | null>(null)

  useLayoutEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    persp.aspect = aspect

    const nextCam = cameraSettings.projection === 'orthographic' ? ortho : persp
    const state = get()
    if (state.camera !== nextCam) {
      nextCam.position.copy(state.camera.position)
      nextCam.quaternion.copy(state.camera.quaternion)
      nextCam.up.copy(state.camera.up)
      nextCam.near = state.camera.near
      nextCam.far = state.camera.far
      set({ camera: nextCam })
      const swapped = state.controls as OrbitControlsLike | null
      if (swapped && 'object' in swapped) swapped.object = nextCam
    }

    const camera = nextCam
    const controls = get().controls as OrbitControlsLike | null

    if (recording) {
      syncActiveFrustum(camera, controls, cameraSettings.fov, aspect)
      return
    }

    if (syncSourceRef.current === 'viewport') {
      syncSourceRef.current = 'panel'
      appliedRef.current = cameraSettings
      syncActiveFrustum(camera, controls, cameraSettings.fov, aspect)
      return
    }

    if (!appliedRef.current || !cameraSettingsEqual(appliedRef.current, cameraSettings)) {
      const live = readCameraSettings(camera, controls, cameraSettings)
      if (!cameraSettingsEqual(live, cameraSettings)) {
        applyCameraSettings(camera, controls, cameraSettings, aspect)
      }
      appliedRef.current = cameraSettings
    }

    syncActiveFrustum(camera, controls, cameraSettings.fov, aspect)
  }, [cameraSettings, recording, syncSourceRef, size.width, size.height, get, set, persp, ortho])

  return (
    <>
      <primitive object={persp} />
      <primitive object={ortho} />
    </>
  )
}

/** Wires Orbit / fit / pick / gizmo camera writeback inside the Canvas. */
function ViewportCameraControls({
  syncSourceRef,
  cameraSettingsRef,
  onCameraSettingsChangeRef,
  recording,
  cameraSettings,
  interactive,
  orbitRotate,
  pickEnabled,
  mouseButtons,
  isProfessional,
  navGizmoApiRef,
  navGizmoOrientationRef,
  modelRoot,
  selectedObject,
  focusToken,
  onPick,
  showSelectionAxes,
}: {
  syncSourceRef: MutableRefObject<'panel' | 'viewport'>
  cameraSettingsRef: MutableRefObject<CameraSettings>
  onCameraSettingsChangeRef: MutableRefObject<((next: CameraSettings) => void) | undefined>
  recording: boolean
  cameraSettings: CameraSettings
  interactive: boolean
  orbitRotate: boolean
  pickEnabled: boolean
  mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number }
  isProfessional: boolean
  navGizmoApiRef: MutableRefObject<NavGizmoApi | null>
  navGizmoOrientationRef: ReturnType<typeof createNavGizmoOrientationRef>
  modelRoot: Object3D | null
  selectedObject: Object3D | null
  focusToken: number
  onPick: (object: Object3D | null) => void
  showSelectionAxes: boolean
}) {
  const publishCamera = useViewportCameraPublisher(
    syncSourceRef,
    cameraSettingsRef,
    onCameraSettingsChangeRef
  )

  return (
    <>
      <CameraRig
        cameraSettings={cameraSettings}
        recording={recording}
        syncSourceRef={syncSourceRef}
      />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={interactive}
        enableRotate={interactive && orbitRotate}
        enableZoom={interactive}
        screenSpacePanning
        mouseButtons={mouseButtons}
        onEnd={publishCamera}
      />
      {isProfessional && !recording ? (
        <NavGizmoBridge
          apiRef={navGizmoApiRef}
          orientationRef={navGizmoOrientationRef}
          onCameraSettled={publishCamera}
        />
      ) : null}
      <InitialModelFitter modelRoot={modelRoot} onCameraSettled={publishCamera} />
      <ClickPicker enabled={interactive && pickEnabled} modelRoot={modelRoot} onPick={onPick} />
      <SelectionOverlay object={selectedObject} showAxes={showSelectionAxes} />
      <SelectionFocuser
        object={selectedObject}
        focusToken={focusToken}
        enabled={interactive}
        onCameraSettled={publishCamera}
      />
    </>
  )
}

function AnimationClock({
  mixerRef,
  actionRef,
  playingRef,
  liveEnabledRef,
  onTime,
}: {
  mixerRef: MutableRefObject<AnimationMixer | null>
  actionRef: MutableRefObject<AnimationAction | null>
  playingRef: MutableRefObject<boolean>
  liveEnabledRef: MutableRefObject<boolean>
  onTime: (time: number) => void
}) {
  const accRef = useRef(0)
  useFrame((_, delta) => {
    if (!liveEnabledRef.current) return
    const mixer = mixerRef.current
    const action = actionRef.current
    if (!mixer || !action || !playingRef.current) return
    mixer.update(delta)
    accRef.current += delta
    if (accRef.current >= 1 / 15) {
      accRef.current = 0
      onTime(action.time)
    }
  })
  return null
}

/** API for fixed-step offline frame capture. Exposed via ref. */
export type CaptureHandle = {
  /**
   * Set the model's turntable rotation (radians) and force-render one frame.
   * Returns a PNG ArrayBuffer of the output at the configured size/cover-crop.
   * @param rotationY – absolute Y rotation in radians
   * @param outputSize – target pixel size (even-aligned)
   * @param renderScale – internal supersampling factor (>1 renders larger
   *   then downsamples with high-quality filtering for sharper anti-aliasing)
   */
  captureFrame: (
    rotationY: number,
    outputSize: { width: number; height: number },
    renderScale?: number,
    capture?: CaptureFrameOptions
  ) => Promise<ArrayBuffer>
  /**
   * Computes a stable capture configuration for the current GPU/device.
   * May lower supersampling scale and/or output size to stay under safe limits.
   */
  planCapture: (
    outputSize: { width: number; height: number },
    renderScale: number
  ) => {
    outputSize: { width: number; height: number }
    renderScale: number
    adjusted: boolean
    reason?: string
  }
  /**
   * Change orbit elevation while recording (bypasses panel sync freeze).
   * When `baseSettings` is set, restores that pose first then applies elevation.
   */
  setOrbitElevationDegrees: (elevationDeg: number, baseSettings?: CameraSettings) => void
  /** Apply a full camera pose (used to restore after multi-axis batch). */
  applyCameraPose: (settings: CameraSettings) => void
  /**
   * Grayscale mask pass: white unlit model + contact shadow on black.
   * Only available when exportMask is enabled (JPEG + no background).
   */
  captureMaskFrame?: (
    rotationY: number,
    outputSize: { width: number; height: number },
    renderScale?: number,
    capture?: CaptureFrameOptions
  ) => Promise<ArrayBuffer>
}

type ViewerSceneProps = {
  model: ModelSource
  cameraSettings: CameraSettings
  lightingSettings: LightingSettings
  shadingMode: ShadingMode
  recording: boolean
  recordingMode: RecordingMode
  /** When false: remove background layers from exports. */
  exportBackground: boolean
  /** Used to decide JPEG opaque flatten vs PNG/WebP alpha capture. */
  imageFormat?: RecordingImageFormat
  /** JPEG + no background → companion grayscale mask PNGs. */
  exportMask?: boolean
  /** Solid fill for Video / JPEG when exportBackground is false. */
  exportFlattenColor?: string
  secondsPerRevolution: number
  msaa?: boolean
  maxTextureSize?: number
  autoNormalizeUnits?: boolean
  importAssumeZUp?: boolean
  driveRef: MutableRefObject<RecordDrive>
  onLoading: (loading: boolean) => void
  onError?: (message: string) => void
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void
  onCameraSettingsChange?: (next: CameraSettings) => void
  captureRef?: MutableRefObject<CaptureHandle | null>
  showInfoHud?: boolean
  onToast?: (tip: { severity: 'info' | 'error' | 'success'; message: string; durationMs?: number }) => void
  onFileSavedToast?: (path: string, skippedTextures?: number) => void
  /** When false, mesh export from Reduce panel is disabled. */
  allowExport?: boolean
  /** When false, texture previews/downloads and asset inspect tools are limited. */
  allowInspectAssets?: boolean
  /** Optional watermark shown on viewport and baked into captures. */
  watermarkText?: string | null
  /** Live Tools → Add Watermark preview (shader only; never mutates inspectRoot). */
  watermarkPreview?: WatermarkConfig | null
}

export function ViewerScene({
  model,
  cameraSettings,
  lightingSettings,
  shadingMode,
  recording,
  recordingMode,
  exportBackground,
  imageFormat = 'png',
  exportMask = false,
  exportFlattenColor = DEFAULT_FLATTEN_COLOR,
  secondsPerRevolution,
  msaa = true,
  maxTextureSize = 0,
  autoNormalizeUnits = true,
  importAssumeZUp = false,
  driveRef,
  onLoading,
  onError,
  onCanvasReady,
  onCameraSettingsChange,
  captureRef,
  showInfoHud = false,
  onToast,
  onFileSavedToast,
  allowExport = true,
  allowInspectAssets = true,
  watermarkText = null,
  watermarkPreview = null,
}: ViewerSceneProps) {
  const t = useT()
  const { previewTheme } = usePreviewTheme()
  const sceneBg = sceneBgForTheme(previewTheme)
  const sceneBgCss = sceneBgCssForTheme(previewTheme)
  const noExportBackground = recording && !exportBackground
  const jpegNoBg = noExportBackground && recordingMode === 'images' && imageFormat === 'jpeg'
  const captureFlatten = noExportBackground && (recordingMode === 'video' || jpegNoBg)
  const captureNeedsAlpha =
    noExportBackground && recordingMode === 'images' && imageFormat !== 'jpeg'
  const flattenCss = normalizeFlattenColor(exportFlattenColor)
  const navGizmoApiRef = useRef<NavGizmoApi | null>(null)
  const navGizmoOrientationRef = useMemo(() => createNavGizmoOrientationRef(), [])
  const [hierarchyRoot, setHierarchyRoot] = useState<HierarchyNode | null>(null)
  const [modelRoot, setModelRoot] = useState<Object3D | null>(null)
  const [inspectRoot, setInspectRoot] = useState<Object3D | null>(null)
  const [innerRoot, setInnerRoot] = useState<Object3D | null>(null)
  const [animations, setAnimations] = useState<AnimationClip[]>([])
  const [clipIndex, setClipIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [animTime, setAnimTime] = useState(0)
  const mixerRef = useRef<AnimationMixer | null>(null)
  const actionRef = useRef<AnimationAction | null>(null)
  const playingRef = useRef(false)
  const loopRef = useRef(true)
  const clipIndexRef = useRef(0)
  const liveEnabledRef = useRef(true)
  const animationsRef = useRef<AnimationClip[]>([])
  const animationApiRef = useRef<AnimationCaptureApi | null>(null)
  const modelRootRef = useRef<Object3D | null>(null)
  const turntableGroupRef = useRef<Group | null>(null)
  const maskShadowMeshRef = useRef<Mesh | null>(null)
  const exportHelpersRef = useRef<Group | null>(null)
  const syncSourceRef = useRef<'panel' | 'viewport'>('panel')
  const cameraSettingsRef = useRef(cameraSettings)
  cameraSettingsRef.current = cameraSettings
  const onCameraSettingsChangeRef = useRef(onCameraSettingsChange)
  onCameraSettingsChangeRef.current = onCameraSettingsChange
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const [activeInspectPanel, setActiveInspectPanel] = useState<InspectPanelId | null>(null)
  const [activeViewportTool, setActiveViewportTool] = useState<ViewportInteractionToolId | null>(
    null
  )
  const [gizmoDragging, setGizmoDragging] = useState(false)
  const transformHistoryRef = useRef(new TransformHistory())
  const sceneRootRef = useRef<HTMLDivElement>(null)
  const [viewportAspect, setViewportAspect] = useState(1)
  const [annotateColor, setAnnotateColor] = useState('#EA334C')
  const [strokes, setStrokes] = useState<AnnotateStroke[]>([])
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const objectsRef = useRef<Map<string, Object3D>>(new Map())
  const onLoadingRef = useRef(onLoading)
  const onErrorRef = useRef(onError)
  onLoadingRef.current = onLoading
  onErrorRef.current = onError
  const modelKey = model.path ?? model.mainUrl
  const isProfessional = previewTheme === 'professional'

  const helperExtents: SceneHelperExtents = useMemo(() => {
    if (!modelRoot) return computeSceneHelperExtents(null)
    return computeSceneHelperExtents(measureObjectSize(modelRoot))
  }, [modelRoot])

  useEffect(() => {
    driveRef.current.radiansPerSecond = (Math.PI * 2) / Math.max(secondsPerRevolution, 1)
    // Offline capture drives rotation; keep live turntable inactive.
    driveRef.current.active = false
  }, [driveRef, secondsPerRevolution])

  // Reset only when the model identity changes — not when parent re-creates callback props.
  useEffect(() => {
    onLoadingRef.current(true)
    setSelectedId(null)
    setFocusToken(0)
    setHierarchyRoot(null)
    setModelRoot(null)
    setInspectRoot(null)
    setInnerRoot(null)
    setAnimations([])
    setClipIndex(0)
    setPlaying(false)
    setAnimTime(0)
    playingRef.current = false
    clipIndexRef.current = 0
    setStrokes([])
    setMeasurements([])
    objectsRef.current = new Map()
    transformHistoryRef.current.clear()
  }, [modelKey])

  const handleModelReady = useCallback(() => {
    onLoadingRef.current(false)
  }, [])
  const handleLoadError = useCallback((message: string) => {
    onLoadingRef.current(false)
    onErrorRef.current?.(message)
  }, [])

  const handleRootChange = useCallback((roots: ModelRoots | null) => {
    const displayRoot = roots?.displayRoot ?? null
    modelRootRef.current = displayRoot
    setModelRoot(displayRoot)
    setInspectRoot(roots?.inspectRoot ?? null)
    setInnerRoot(roots?.innerRoot ?? null)
    setAnimations(roots?.animations ?? [])
    if (!displayRoot) {
      objectsRef.current = new Map()
      setHierarchyRoot(null)
      setSelectedId(null)
      return
    }
    const hierarchySource = roots?.innerRoot ?? displayRoot
    const built = buildSceneHierarchy(hierarchySource)
    objectsRef.current = built.objects
    setHierarchyRoot(built.root)
  }, [])

  animationsRef.current = animations
  playingRef.current = playing
  loopRef.current = loop
  clipIndexRef.current = clipIndex

  useEffect(() => {
    if (!innerRoot) {
      mixerRef.current = null
      actionRef.current = null
      return
    }
    const mixer = createAnimationMixer(innerRoot)
    mixerRef.current = mixer
    const onFinished = () => {
      if (loopRef.current) return
      playingRef.current = false
      setPlaying(false)
      const action = actionRef.current
      if (action) setAnimTime(action.time)
    }
    mixer.addEventListener('finished', onFinished)
    return () => {
      mixer.removeEventListener('finished', onFinished)
      mixer.stopAllAction()
      mixer.uncacheRoot(innerRoot)
      if (mixerRef.current === mixer) mixerRef.current = null
    }
  }, [innerRoot])

  useEffect(() => {
    const mixer = mixerRef.current
    const clips = animations
    setPlaying(false)
    playingRef.current = false
    setClipIndex(0)
    clipIndexRef.current = 0
    setAnimTime(0)
    if (!mixer || clips.length === 0) {
      actionRef.current = null
      return
    }
    actionRef.current = bindClipAction(mixer, clips[0]!, loopRef.current)
  }, [innerRoot, animations])

  const handleClipChange = useCallback((index: number) => {
    const mixer = mixerRef.current
    const clips = animationsRef.current
    const clip = clips[index]
    if (!mixer || !clip) return
    actionRef.current = bindClipAction(mixer, clip, loopRef.current)
    clipIndexRef.current = index
    setClipIndex(index)
    playingRef.current = false
    setPlaying(false)
    setAnimTime(0)
  }, [])

  const handleTogglePlay = useCallback(() => {
    const mixer = mixerRef.current
    const action = actionRef.current
    const clip = animationsRef.current[clipIndexRef.current]
    if (!mixer || !action || !clip) return
    if (playingRef.current) {
      action.paused = true
      mixer.update(0)
      playingRef.current = false
      setPlaying(false)
      setAnimTime(action.time)
      return
    }
    if (!loopRef.current && action.time >= Math.max(clip.duration, 0) - 1e-4) {
      action.time = 0
    }
    action.paused = false
    action.enabled = true
    action.play()
    playingRef.current = true
    setPlaying(true)
  }, [])

  const handleSeek = useCallback((time: number) => {
    const mixer = mixerRef.current
    const action = actionRef.current
    if (!mixer || !action) return
    const wasPlaying = playingRef.current
    seekAction(mixer, action, time)
    setAnimTime(time)
    if (wasPlaying) {
      action.paused = false
      action.play()
    }
  }, [])

  const handleToggleLoop = useCallback(() => {
    const next = !loopRef.current
    loopRef.current = next
    setLoop(next)
    const action = actionRef.current
    if (action) applyClipLoop(action, next)
  }, [])

  const handleAnimTime = useCallback((time: number) => {
    setAnimTime(time)
  }, [])

  useEffect(() => {
    animationApiRef.current = {
      snapshot: () => {
        const clips = animationsRef.current
        if (clips.length === 0) return null
        const clip = clips[clipIndexRef.current] ?? clips[0]!
        return {
          playing: playingRef.current,
          clipIndex: clipIndexRef.current,
          time: actionRef.current?.time ?? 0,
          duration: clip.duration,
          loop: loopRef.current,
        }
      },
      seekCapture: (snapshot, frameIndex, fps) => {
        const mixer = mixerRef.current
        const clips = animationsRef.current
        const clip = clips[snapshot.clipIndex]
        if (!mixer || !clip) return
        let action = actionRef.current
        if (!action || clipIndexRef.current !== snapshot.clipIndex) {
          action = bindClipAction(mixer, clip, snapshot.loop)
          actionRef.current = action
          clipIndexRef.current = snapshot.clipIndex
        }
        applyClipLoop(action, snapshot.loop)
        const t = captureSeekTime(snapshot, frameIndex, fps)
        seekAction(mixer, action, t)
      },
      restore: snapshot => {
        const mixer = mixerRef.current
        const clips = animationsRef.current
        const clip = clips[snapshot.clipIndex]
        if (!mixer || !clip) return
        const action = bindClipAction(mixer, clip, snapshot.loop)
        actionRef.current = action
        clipIndexRef.current = snapshot.clipIndex
        loopRef.current = snapshot.loop
        setLoop(snapshot.loop)
        setClipIndex(snapshot.clipIndex)
        seekAction(mixer, action, snapshot.time)
        if (snapshot.playing) {
          action.paused = false
          action.play()
        }
        playingRef.current = snapshot.playing
        setPlaying(snapshot.playing)
        setAnimTime(snapshot.time)
      },
      setLiveEnabled: enabled => {
        liveEnabledRef.current = enabled
      },
    }
    return () => {
      animationApiRef.current = null
    }
  }, [])

  // Live Tools → Add Watermark preview on the display clone only (never inspectRoot).
  // Incremental uniform updates for intensity/tileScale; stamp/mode changes bump the
  // program cache key so Three.js re-runs onBeforeCompile (avoids disposed stamp binds).
  useEffect(() => {
    if (!innerRoot) return
    if (!watermarkPreview) {
      clearTriplanarPreview(innerRoot)
      return
    }

    let stamp: ReturnType<typeof createStampTexture> | null = null
    try {
      stamp = createStampTexture(watermarkPreview)
      applyTriplanarPreview(innerRoot, stamp, watermarkPreview)
    } catch {
      clearTriplanarPreview(innerRoot)
      stamp?.dispose()
      stamp = null
    }

    return () => {
      stamp?.dispose()
    }
  }, [innerRoot, watermarkPreview])

  useEffect(() => {
    const root = innerRoot
    return () => {
      if (root) clearTriplanarPreview(root)
    }
  }, [innerRoot])

  const selectedObject = selectedId ? (objectsRef.current.get(selectedId) ?? null) : null
  /** While move/rotate/scale are active, overlays follow the whole model (innerRoot). */
  const overlayObject =
    isTransformMode(activeViewportTool) && innerRoot ? innerRoot : selectedObject

  const textures = useMemo(() => {
    if (!inspectRoot) return []
    const items = extractTextures(inspectRoot)
    if (allowInspectAssets) return items
    return items.map(item => ({ ...item, previewUrl: null }))
  }, [inspectRoot, allowInspectAssets])
  const materials = useMemo(() => {
    if (!inspectRoot) return []
    const extracted = extractMaterials(inspectRoot)
    return withResolvedMeshIds(extracted, objectsRef.current)
  }, [inspectRoot, hierarchyRoot])
  const geometries = useMemo(() => (modelRoot ? extractGeometries(modelRoot) : []), [modelRoot])
  const sceneInfo = useMemo(
    () =>
      modelRoot
        ? extractSceneInfo(modelRoot, model.label, inspectRoot, animations.length)
        : null,
    [modelRoot, inspectRoot, model.label, animations.length]
  )

  const handleToggleVisible = useCallback((id: string) => {
    const object = objectsRef.current.get(id)
    if (!object) return
    object.visible = !object.visible
    setHierarchyRoot(prev => (prev ? syncHierarchyVisibility(prev, objectsRef.current) : prev))
  }, [])

  const handleHierarchySelect = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) setFocusToken(token => token + 1)
  }, [])

  /** Viewport pick selects the hierarchy node under the cursor (same as Hierarchy panel). */
  const handlePick = useCallback((object: Object3D | null) => {
    if (!object) {
      setSelectedId(null)
      return
    }
    const id = object.userData.__hierId as string | undefined
    if (!id) return
    setActiveInspectPanel('hierarchy')
    setSelectedId(id)
    setFocusToken(token => token + 1)
  }, [])

  useEffect(() => {
    applyShadingMode(modelRoot, shadingMode)
    if (lightingSettings.mode === 'studio') {
      applyEnvMapIntensity(modelRoot, lightingSettings.envIntensity)
    }
    const isRendered = lightingSettings.mode === 'rendered'
    setModelOwnLightsEnabled(modelRoot, isRendered)
  }, [modelRoot, shadingMode, lightingSettings.envIntensity, lightingSettings.mode])

  useLayoutEffect(() => {
    const el = sceneRootRef.current
    if (!el) return
    const update = () => {
      const h = el.clientHeight
      if (h > 0) setViewportAspect(el.clientWidth / h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const viewZoom = useMemo(
    () => viewZoomFactor(cameraSettings, modelRoot, viewportAspect),
    [cameraSettings, modelRoot, viewportAspect]
  )

  const handleInspectToggle = useCallback((id: InspectPanelId) => {
    setActiveInspectPanel(prev => (prev === id ? null : id))
  }, [])

  const handleInteractionToggle = useCallback((id: ViewportInteractionToolId) => {
    setActiveViewportTool(prev => (prev === id ? null : id))
  }, [])

  /** Opening move/rotate/scale forces selection onto the whole-model root (gizmo target). */
  useEffect(() => {
    if (!isTransformMode(activeViewportTool) || !innerRoot) return
    const id = innerRoot.userData.__hierId as string | undefined
    if (!id) return
    setSelectedId(id)
  }, [activeViewportTool, innerRoot])

  const closeInspectPanel = useCallback(() => setActiveInspectPanel(null), [])

  const decimateActive = activeInspectPanel === 'decimate' && !recording
  const decimate = useDecimateSession(innerRoot, decimateActive)
  const [decimateExporting, setDecimateExporting] = useState(false)

  const handleDecimateExport = useCallback(async () => {
    setDecimateExporting(true)
    try {
      const exported = await decimate.exportGlb()
      const desktop = window.desktop
      if (!desktop?.saveModelFile) {
        onToast?.({ severity: 'error', message: t('error.desktopUnavailable'), durationMs: 4000 })
        return
      }
      const result = await desktop.saveModelFile({
        defaultName: `${model.label}-reduced`,
        data: exported.data,
        sourcePath: model.path ?? undefined,
      })
      if (!result.ok) {
        onToast?.({
          severity: result.reason === 'canceled' ? 'info' : 'error',
          message:
            result.reason === 'canceled'
              ? t('decimate.saveCanceled')
              : t('decimate.saveFailed', { reason: result.reason }),
          durationMs: 4000,
        })
        return
      }
      onFileSavedToast?.(result.path, exported.skippedTextures)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      onToast?.({
        severity: 'error',
        message: t('decimate.saveFailed', { reason }),
        durationMs: 4000,
      })
    } finally {
      setDecimateExporting(false)
    }
  }, [decimate, model.label, model.path, onFileSavedToast, onToast, t])

  const interactive = !recording
  // LMB orbit (short click still picks via ClickPicker); MMB dolly; RMB pan; wheel zoom.
  const mouseButtons = useMemo(
    () => ({
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    }),
    []
  )

  const transformGizmoActive =
    interactive && isTransformMode(activeViewportTool) && !isSurfaceToolId(activeViewportTool)
  // LMB reserved for gizmo while translate/rotate/scale is active (orbit via MMB/RMB still limited: MMB=dolly).
  const orbitRotate =
    interactive &&
    !isSurfaceToolId(activeViewportTool) &&
    !isTransformMode(activeViewportTool) &&
    !gizmoDragging
  const pickEnabled = interactive && !isSurfaceToolId(activeViewportTool) && !gizmoDragging

  useEffect(() => {
    if (!interactive) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        const resolve = (hierId: string) => objectsRef.current.get(hierId) ?? null
        if (event.shiftKey) transformHistoryRef.current.redo(resolve)
        else transformHistoryRef.current.undo(resolve)
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'g') {
        event.preventDefault()
        setActiveViewportTool('translate')
      } else if (key === 'r') {
        event.preventDefault()
        setActiveViewportTool('rotate')
      } else if (key === 's') {
        event.preventDefault()
        setActiveViewportTool('scale')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [interactive])

  return (
    <div className="scene-root" ref={sceneRootRef}>
      {watermarkText && !recording ? (
        <div className="viewport-watermark" aria-hidden>
          {watermarkText}
        </div>
      ) : null}
      {!recording ? (
        <ViewportToolbar
          activeInspect={activeInspectPanel}
          activeInteraction={activeViewportTool}
          onToggleInspect={handleInspectToggle}
          onToggleInteraction={handleInteractionToggle}
          disabled={!modelRoot}
          allowInspectAssets={allowInspectAssets}
        />
      ) : null}
      {showInfoHud && !recording ? (
        <ViewportInfoHud
          projection={cameraSettings.projection}
          viewZoom={viewZoom}
          unitScale={modelRoot ? modelRoot.scale.x : null}
          shiftDown={isSurfaceToolId(activeViewportTool)}
        />
      ) : null}
      {!recording && animations.length > 0 ? (
        <AnimationPlaybackBar
          clips={animations}
          clipIndex={clipIndex}
          playing={playing}
          loop={loop}
          time={animTime}
          onClipChange={handleClipChange}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onToggleLoop={handleToggleLoop}
        />
      ) : null}
      {!recording ? (
        <ViewportToolOptions
          active={activeViewportTool}
          annotateColor={annotateColor}
          onAnnotateColorChange={setAnnotateColor}
          canClearAnnotate={strokes.length > 0}
          canClearMeasure={measurements.length > 0}
          onClearAnnotate={() => setStrokes([])}
          onClearMeasure={() => setMeasurements([])}
        />
      ) : null}
      {isProfessional && !recording ? (
        <NavGizmoCard apiRef={navGizmoApiRef} orientationRef={navGizmoOrientationRef} />
      ) : null}
      <div className="inspect-dock">
        <HierarchyPanel
          open={activeInspectPanel === 'hierarchy'}
          modelKey={modelKey}
          root={hierarchyRoot}
          selectedId={selectedId}
          onOpenChange={open => setActiveInspectPanel(open ? 'hierarchy' : null)}
          onSelect={handleHierarchySelect}
          onToggleVisible={handleToggleVisible}
        />
        <TexturesPanel
          open={activeInspectPanel === 'textures'}
          items={textures}
          allowInspectAssets={allowInspectAssets}
          onClose={closeInspectPanel}
        />
        <MaterialsPanel
          open={activeInspectPanel === 'materials'}
          items={materials}
          onClose={closeInspectPanel}
          onSelectMesh={id => handleHierarchySelect(id)}
        />
        <GeometriesPanel
          open={activeInspectPanel === 'geometries'}
          items={geometries}
          onClose={closeInspectPanel}
          onSelectMesh={id => handleHierarchySelect(id)}
        />
        <InfoPanel open={activeInspectPanel === 'info'} stats={sceneInfo} onClose={closeInspectPanel} />
        <DecimatePanel
          open={decimateActive}
          stats={decimate.stats}
          percent={decimate.percent}
          lockBorder={decimate.lockBorder}
          exporting={decimateExporting}
          exportDisabled={!allowExport}
          onPercentChange={decimate.setPercent}
          onLockBorderChange={decimate.setLockBorder}
          onExport={() => {
            void handleDecimateExport()
          }}
          onClose={closeInspectPanel}
        />
      </div>
      <Canvas
        key={`aa-${msaa ? 'on' : 'off'}`}
        className="scene-canvas"
        style={{ display: 'block', width: '100%', height: '100%', background: sceneBgCss }}
        gl={{
          antialias: msaa,
          // Always RGBA so PNG/WebP "no background" can capture true transparency
          // without remounting when export starts. Unpremultiplied keeps clear(a=0)
          // from collapsing into opaque black.
          alpha: true,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
        }}
        frameloop="always"
        dpr={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1.75)}
        onCreated={({ gl }) => {
          gl.setClearColor(sceneBg, 1)
        }}
      >
        <CanvasBridge onCanvasReady={onCanvasReady} />
        {captureRef && (
          <CaptureBridge
            turntableGroupRef={turntableGroupRef}
            captureRef={captureRef}
            captureNeedsAlpha={captureNeedsAlpha}
            captureFlatten={captureFlatten}
            exportFlattenColor={flattenCss}
            maskShadowMeshRef={maskShadowMeshRef}
            exportHelpersRef={exportHelpersRef}
            exportMask={exportMask}
            recording={recording}
            animationApiRef={animationApiRef}
            watermarkText={watermarkText}
          />
        )}
        <AnimationClock
          mixerRef={mixerRef}
          actionRef={actionRef}
          playingRef={playingRef}
          liveEnabledRef={liveEnabledRef}
          onTime={handleAnimTime}
        />
        <SceneLighting
          settings={lightingSettings}
          modelRoot={modelRoot}
          previewTheme={previewTheme}
          fogNear={helperExtents.fogNear}
          fogFar={helperExtents.fogFar}
          noExportBackground={noExportBackground}
          captureFlatten={captureFlatten}
          exportFlattenColor={flattenCss}
        />
        <group ref={exportHelpersRef} visible={!noExportBackground}>
          {isProfessional ? (
            recording ? null : (
              <ProfessionalFloor fadeDistance={Math.max(50, helperExtents.fogFar)} />
            )
          ) : (
            <>
              <Ground size={helperExtents.groundSize} />
              <SoftContactShadow size={helperExtents.shadowSize} />
            </>
          )}
        </group>
        {exportMask ? (
          <MaskContactShadow size={helperExtents.shadowSize} meshRef={maskShadowMeshRef} />
        ) : null}
        <ViewportCameraControls
          syncSourceRef={syncSourceRef}
          cameraSettingsRef={cameraSettingsRef}
          onCameraSettingsChangeRef={onCameraSettingsChangeRef}
          recording={recording}
          navGizmoApiRef={navGizmoApiRef}
          navGizmoOrientationRef={navGizmoOrientationRef}
          isProfessional={isProfessional}
          interactive={interactive}
          orbitRotate={orbitRotate}
          pickEnabled={pickEnabled}
          mouseButtons={mouseButtons}
          cameraSettings={cameraSettings}
          modelRoot={modelRoot}
          selectedObject={overlayObject}
          focusToken={focusToken}
          onPick={handlePick}
          showSelectionAxes={!transformGizmoActive}
        />
        {isTransformMode(activeViewportTool) && interactive ? (
          <ObjectTransformGizmo
            object={innerRoot}
            mode={activeViewportTool}
            space="global"
            enabled={!recording}
            history={transformHistoryRef.current}
            onDraggingChange={setGizmoDragging}
          />
        ) : null}
        <SurfaceAnnotate
          enabled={interactive && activeViewportTool === 'annotate'}
          visible={!recording}
          modelRoot={modelRoot}
          color={annotateColor}
          strokes={strokes}
          onStrokesChange={setStrokes}
        />
        <SurfaceMeasure
          enabled={interactive && activeViewportTool === 'measure'}
          visible={!recording}
          modelRoot={modelRoot}
          measurements={measurements}
          onMeasurementsChange={setMeasurements}
        />
        <Suspense fallback={null}>
          <ModelLoadErrorBoundary resetKey={modelKey} onError={handleLoadError}>
            <TurntableGroup
              recording={recording}
              modelRoot={modelRoot}
              groupRefOut={turntableGroupRef}
            >
              <LoadedModel
                key={`${modelKey}:tex-${maxTextureSize}:norm-${autoNormalizeUnits ? 'on' : 'off'}:zup-${importAssumeZUp ? 'on' : 'off'}`}
                model={model}
                maxTextureSize={maxTextureSize}
                autoNormalizeUnits={autoNormalizeUnits}
                importAssumeZUp={importAssumeZUp}
                onReady={handleModelReady}
                onRootChange={handleRootChange}
              />
            </TurntableGroup>
          </ModelLoadErrorBoundary>
        </Suspense>
      </Canvas>
    </div>
  )
}
