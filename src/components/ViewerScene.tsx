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
  ArrowHelper,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  Fog,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type Texture,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { type CameraSettings } from '../config/cameraDefaults'
import type { LightingSettings } from '../config/lightingDefaults'
import {
  cameraSettingsEqual,
  focusCameraOnObject,
  readCameraSettings,
  resolveHierarchyObject,
  worldSizeFromScreenSize,
} from '../lib/cameraFocus'
import { configureGltfLoader, getKtx2Loader } from '../lib/configureGltfLoader'
import {
  extractGeometries,
  extractMaterials,
  extractSceneInfo,
  extractTextures,
  withResolvedMeshIds,
} from '../lib/inspectScene'
import { attachResourceUrlModifier, basenameOf, type ModelSource } from '../lib/modelSource'
import {
  buildSceneHierarchy,
  syncHierarchyVisibility,
  type HierarchyNode,
} from '../lib/sceneHierarchy'
import { createStudioLightScene } from '../lib/studioLightScene'
import { HierarchyPanel } from './HierarchyPanel'
import { GeometriesPanel } from './inspect/GeometriesPanel'
import { InfoPanel } from './inspect/InfoPanel'
import type { InspectPanelId } from './inspect/InspectPanelShell'
import { MaterialsPanel } from './inspect/MaterialsPanel'
import { TexturesPanel } from './inspect/TexturesPanel'
import { limitObjectTextures } from '../lib/limitObjectTextures'
import { ViewportToolbar } from './ViewportToolbar'
import {
  createNavGizmoOrientationRef,
  NavGizmoBridge,
  NavGizmoCard,
  type NavGizmoApi,
} from './NavGizmo'
import { applyShadingMode, type ShadingMode } from '../lib/shadingMode'
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
}

/** @deprecated Prefer sceneBgCssForTheme — kept for callers expecting the simple theme. */
export const SCENE_BG_CSS = SIMPLE_SCENE_BG_CSS
const GROUND_COLOR = 0xcbcbcb
const CLICK_MAX_MS = 200
const CLICK_MAX_MOVE_PX = 4
const WIRE_COLOR = '#ec7700'

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
    if (!(child instanceof Mesh)) return
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
    if (!(child instanceof Mesh)) return
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
    if (child instanceof Mesh) {
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
  /** Scaled display clone used for rendering, hierarchy, and geometries. */
  displayRoot: Object3D
  /** Original loaded scene — materials/textures inspection only (never mutated). */
  inspectRoot: Object3D
}

/** Clone for display; feet on ground. Turntable pivot is a separate parent group. */
function prepareDisplayRoot(source: Object3D, maxTextureSize: number): Object3D {
  const cloned = deepCloneScene(source)
  prepareModelMeshes(cloned)
  limitObjectTextures(cloned, maxTextureSize)
  placeModelOnGround(cloned)
  return cloned
}

function usePublishModelRoots(
  source: Object3D,
  onReady: () => void,
  onRootChange: (roots: ModelRoots | null) => void,
  maxTextureSize: number
) {
  const displayRoot = useMemo(
    () => prepareDisplayRoot(source, maxTextureSize),
    [source, maxTextureSize]
  )

  useEffect(() => {
    onRootChange({ displayRoot, inspectRoot: source })
    const id = window.setTimeout(() => onReady(), 0)
    return () => {
      window.clearTimeout(id)
      onRootChange(null)
    }
  }, [displayRoot, source, onReady, onRootChange])

  return displayRoot
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
  onReady,
  onRootChange,
}: {
  mainUrl: string
  resourceUrls: Record<string, string>
  maxTextureSize: number
  onReady: () => void
  onRootChange: (roots: ModelRoots | null) => void
}) {
  const gl = useThree(s => s.gl)
  const ktx2Loader = useMemo(() => getKtx2Loader(gl), [gl])
  const gltf = useLoader(GLTFLoader, mainUrl, loader => {
    configureGltfLoader(loader, { resourceUrls, ktx2Loader })
  })
  const displayRoot = usePublishModelRoots(gltf.scene, onReady, onRootChange, maxTextureSize)
  return <primitive object={displayRoot} />
}

function LoadedObjWithMtl({
  mainUrl,
  mtlUrl,
  resourceUrls,
  maxTextureSize,
  onReady,
  onRootChange,
}: {
  mainUrl: string
  mtlUrl: string
  resourceUrls: Record<string, string>
  maxTextureSize: number
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
  const displayRoot = usePublishModelRoots(object, onReady, onRootChange, maxTextureSize)
  return <primitive object={displayRoot} />
}

function LoadedObjBare({
  mainUrl,
  resourceUrls,
  maxTextureSize,
  onReady,
  onRootChange,
}: {
  mainUrl: string
  resourceUrls: Record<string, string>
  maxTextureSize: number
  onReady: () => void
  onRootChange: (roots: ModelRoots | null) => void
}) {
  const object = useLoader(OBJLoader, mainUrl, loader => {
    attachResourceUrlModifier(loader.manager, resourceUrls)
  })
  const displayRoot = usePublishModelRoots(object, onReady, onRootChange, maxTextureSize)
  return <primitive object={displayRoot} />
}

function LoadedModel({
  model,
  maxTextureSize,
  onReady,
  onRootChange,
}: {
  model: ModelSource
  maxTextureSize: number
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
        onReady={onReady}
        onRootChange={onRootChange}
      />
    )
  }

  return (
    <LoadedGltfModel
      mainUrl={model.mainUrl}
      resourceUrls={model.resourceUrls}
      maxTextureSize={maxTextureSize}
      onReady={onReady}
      onRootChange={onRootChange}
    />
  )
}

/** Wireframe overlay + RGB origin axes — mirrors glb-viewer-core selection visuals. */
function SelectionOverlay({ object }: { object: Object3D | null }) {
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

    if (object instanceof Mesh && object.geometry) {
      const wire = new Mesh(object.geometry as BufferGeometry, wireMaterial)
      wire.renderOrder = 500
      wire.userData.__hierarchyIgnore = true
      wire.frustumCulled = false
      root.add(wire)
      wireRef.current = wire
    }

    const axes = new Object3D()
    axes.userData.__hierarchyIgnore = true
    const makeArrow = (dir: Vector3, color: string) => {
      const arrow = new ArrowHelper(dir, new Vector3(0, 0, 0), 1, color)
      arrow.traverse(child => {
        if (child instanceof Mesh || (child as { material?: Material }).material) {
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
  }, [object, wireMaterial])

  useFrame(() => {
    if (!object || !(camera instanceof PerspectiveCamera)) return
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
    if (!(camera instanceof PerspectiveCamera)) return
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
    if (!(camera instanceof PerspectiveCamera)) return
    focusCameraOnObject(modelRoot, camera, controls)
    onCameraSettled?.()
  }, [modelRoot, camera, controls, onCameraSettled])

  return null
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
  const { camera, gl } = useThree()
  const downAtRef = useRef(0)
  const downPosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return
    const element = gl.domElement

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      downAtRef.current = Date.now()
      downPosRef.current = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (Date.now() - downAtRef.current >= CLICK_MAX_MS) return
      const dx = event.clientX - downPosRef.current.x
      const dy = event.clientY - downPosRef.current.y
      if (dx * dx + dy * dy > CLICK_MAX_MOVE_PX * CLICK_MAX_MOVE_PX) return
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
  }, [enabled, modelRoot, camera, gl, onPick])

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

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial color={GROUND_COLOR} depthWrite={false} />
    </mesh>
  )
}

/** World-origin XYZ shafts; hide while recording so they never appear in exports. */
function OriginAxes({ visible = true }: { visible?: boolean }) {
  const axes = useMemo(() => {
    const root = new Object3D()
    // headLength = 0 matches glb-viewer-core (line shafts only, no cones)
    root.add(new ArrowHelper(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 1, '#EA334C', 0))
    root.add(new ArrowHelper(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 1, '#80CA1E', 0))
    root.add(new ArrowHelper(new Vector3(0, 0, 1), new Vector3(0, 0, 0), 1, '#2D83E8', 0))
    return root
  }, [])

  useEffect(() => {
    return () => {
      for (const child of axes.children) {
        if (child instanceof ArrowHelper) child.dispose()
      }
    }
  }, [axes])

  if (!visible) return null
  return <primitive object={axes} />
}

function ProfessionalFloor({ showAxes }: { showAxes: boolean }) {
  const grid = useMemo(() => {
    const helper = new GridHelper(10, 10, '#4B4B4B', '#4B4B4B')
    const material = helper.material
    if (Array.isArray(material)) {
      for (const mat of material) mat.depthWrite = false
    } else {
      material.depthWrite = false
    }
    helper.renderOrder = -999999
    return helper
  }, [])

  useEffect(() => {
    return () => {
      grid.geometry.dispose()
      const material = grid.material
      if (Array.isArray(material)) {
        for (const mat of material) mat.dispose()
      } else {
        material.dispose()
      }
    }
  }, [grid])

  return (
    <>
      <primitive object={grid} />
      <OriginAxes visible={showAxes} />
    </>
  )
}

function SoftContactShadow() {
  const texture = useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(0,0,0,0.38)')
    gradient.addColorStop(0.35, 'rgba(0,0,0,0.16)')
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.05)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    return map
  }, [])

  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  if (!texture) return null

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0.05, 0.001, 0.06]}
      scale={[1.55, 1, 1.05]}
      renderOrder={-1}
    >
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

function SceneLighting({
  settings,
  modelRoot,
  previewTheme,
}: {
  settings: LightingSettings
  modelRoot: Object3D | null
  previewTheme: PreviewTheme
}) {
  const { gl, scene } = useThree()
  const pmremRef = useRef<PMREMGenerator | null>(null)
  const envTexRef = useRef<Texture | null>(null)
  const sceneBg = sceneBgForTheme(previewTheme)

  useLayoutEffect(() => {
    scene.background = new Color(sceneBg)
    scene.fog = previewTheme === 'professional' ? null : new Fog(sceneBg, 10, 80)
    gl.outputColorSpace = SRGBColorSpace
    gl.toneMapping = NeutralToneMapping
    gl.toneMappingExposure = settings.exposure
    gl.setClearColor(sceneBg, 1)
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

/** Provides fixed-step offline capture capability via ref. */
function CaptureBridge({
  turntableGroupRef,
  captureRef,
}: {
  turntableGroupRef: MutableRefObject<Group | null>
  captureRef: MutableRefObject<CaptureHandle | null>
}) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    captureRef.current = {
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
        renderScale = 1
      ): Promise<ArrayBuffer> => {
        return new Promise((resolve, reject) => {
          const src = gl.domElement
          const prevPixelRatio = gl.getPixelRatio()
          const prevSize = new Vector2()
          gl.getSize(prevSize)
          try {
            // Set rotation on the turntable group
            const root = turntableGroupRef.current
            if (root) root.rotation.y = rotationY

            // Render at native output-resolved pixels (no upscale blur),
            // then center-crop to keep "cover fill" behavior.
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

            // Supersample: render at `renderScale`x the resolved size, then
            // downscale (with high-quality filtering) while cropping to the
            // final "cover fill" output. This sharply reduces jagged edges
            // and shimmer compared to rendering directly at target size.
            const ssaa = Math.max(1, renderScale)
            const renderW = Math.round(rw * ssaa)
            const renderH = Math.round(rh * ssaa)

            gl.setPixelRatio(1)
            gl.setSize(renderW, renderH, false)
            gl.render(scene, camera)
            gl.getContext().finish()

            const stage = document.createElement('canvas')
            stage.width = tw
            stage.height = th
            const ctx = stage.getContext('2d', { alpha: false })
            if (!ctx) {
              reject(new Error('Failed to get 2D context for capture'))
              return
            }
            // Cover crop from the (possibly supersampled) rendered frame,
            // then downscale to the target size in a single draw.
            const cropW = Math.round(tw * ssaa)
            const cropH = Math.round(th * ssaa)
            const sx = Math.max(0, Math.floor((renderW - cropW) / 2))
            const sy = Math.max(0, Math.floor((renderH - cropH) / 2))
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, tw, th)
            ctx.drawImage(src, sx, sy, cropW, cropH, 0, 0, tw, th)

            // Encode to PNG (lossless intermediate frames)
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
            gl.setPixelRatio(prevPixelRatio)
            gl.setSize(prevSize.x, prevSize.y, false)
          }
        })
      },
    }

    return () => {
      captureRef.current = null
    }
  }, [gl, scene, camera, turntableGroupRef, captureRef])

  return null
}

function applyCameraSettings(
  camera: PerspectiveCamera,
  controls: OrbitControlsLike | null | undefined,
  cameraSettings: CameraSettings
) {
  camera.position.set(cameraSettings.posX, cameraSettings.posY, cameraSettings.posZ)
  camera.fov = cameraSettings.fov
  camera.near = 0.1
  camera.far = 100
  camera.updateProjectionMatrix()

  if (!controls) return
  controls.target.set(cameraSettings.targetX, cameraSettings.targetY, cameraSettings.targetZ)
  controls.update()
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
    if (!(camera instanceof PerspectiveCamera)) return
    const next = readCameraSettings(camera, controls)
    if (cameraSettingsEqual(next, cameraSettingsRef.current)) return
    syncSourceRef.current = 'viewport'
    onCameraSettingsChangeRef.current?.(next)
  }, [camera, controls, syncSourceRef, cameraSettingsRef, onCameraSettingsChangeRef])
}

/**
 * Applies panel camera settings when they change from the panel.
 * Skips viewport writebacks and does not re-apply merely because recording ended.
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
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls) as OrbitControlsLike | null
  const appliedRef = useRef<CameraSettings | null>(null)

  useLayoutEffect(() => {
    if (recording) return
    if (!(camera instanceof PerspectiveCamera)) return

    if (syncSourceRef.current === 'viewport') {
      syncSourceRef.current = 'panel'
      appliedRef.current = cameraSettings
      return
    }

    if (appliedRef.current && cameraSettingsEqual(appliedRef.current, cameraSettings)) {
      return
    }

    const live = readCameraSettings(camera, controls)
    if (cameraSettingsEqual(live, cameraSettings)) {
      appliedRef.current = cameraSettings
      return
    }

    applyCameraSettings(camera, controls, cameraSettings)
    appliedRef.current = cameraSettings
  }, [camera, controls, cameraSettings, recording, syncSourceRef])

  return null
}

/** Wires Orbit / fit / pick / gizmo camera writeback inside the Canvas. */
function ViewportCameraControls({
  syncSourceRef,
  cameraSettingsRef,
  onCameraSettingsChangeRef,
  recording,
  cameraSettings,
  interactive,
  mouseButtons,
  isProfessional,
  navGizmoApiRef,
  navGizmoOrientationRef,
  modelRoot,
  selectedObject,
  focusToken,
  onPick,
}: {
  syncSourceRef: MutableRefObject<'panel' | 'viewport'>
  cameraSettingsRef: MutableRefObject<CameraSettings>
  onCameraSettingsChangeRef: MutableRefObject<((next: CameraSettings) => void) | undefined>
  recording: boolean
  cameraSettings: CameraSettings
  interactive: boolean
  mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number }
  isProfessional: boolean
  navGizmoApiRef: MutableRefObject<NavGizmoApi | null>
  navGizmoOrientationRef: ReturnType<typeof createNavGizmoOrientationRef>
  modelRoot: Object3D | null
  selectedObject: Object3D | null
  focusToken: number
  onPick: (object: Object3D | null) => void
}) {
  const publishCamera = useViewportCameraPublisher(
    syncSourceRef,
    cameraSettingsRef,
    onCameraSettingsChangeRef
  )

  return (
    <>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={interactive}
        enableRotate={interactive}
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
      <CameraRig
        cameraSettings={cameraSettings}
        recording={recording}
        syncSourceRef={syncSourceRef}
      />
      <InitialModelFitter modelRoot={modelRoot} onCameraSettled={publishCamera} />
      <ClickPicker enabled={interactive} modelRoot={modelRoot} onPick={onPick} />
      <SelectionOverlay object={selectedObject} />
      <SelectionFocuser
        object={selectedObject}
        focusToken={focusToken}
        enabled={interactive}
        onCameraSettled={publishCamera}
      />
    </>
  )
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
    renderScale?: number
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
}

type ViewerSceneProps = {
  model: ModelSource
  cameraSettings: CameraSettings
  lightingSettings: LightingSettings
  shadingMode: ShadingMode
  recording: boolean
  secondsPerRevolution: number
  msaa?: boolean
  maxTextureSize?: number
  driveRef: MutableRefObject<RecordDrive>
  onLoading: (loading: boolean) => void
  onError?: (message: string) => void
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void
  onCameraSettingsChange?: (next: CameraSettings) => void
  captureRef?: MutableRefObject<CaptureHandle | null>
}

export function ViewerScene({
  model,
  cameraSettings,
  lightingSettings,
  shadingMode,
  recording,
  secondsPerRevolution,
  msaa = true,
  maxTextureSize = 0,
  driveRef,
  onLoading,
  onError,
  onCanvasReady,
  onCameraSettingsChange,
  captureRef,
}: ViewerSceneProps) {
  const { previewTheme } = usePreviewTheme()
  const sceneBg = sceneBgForTheme(previewTheme)
  const sceneBgCss = sceneBgCssForTheme(previewTheme)
  const navGizmoApiRef = useRef<NavGizmoApi | null>(null)
  const navGizmoOrientationRef = useMemo(() => createNavGizmoOrientationRef(), [])
  const [hierarchyRoot, setHierarchyRoot] = useState<HierarchyNode | null>(null)
  const [modelRoot, setModelRoot] = useState<Object3D | null>(null)
  const [inspectRoot, setInspectRoot] = useState<Object3D | null>(null)
  const modelRootRef = useRef<Object3D | null>(null)
  const turntableGroupRef = useRef<Group | null>(null)
  const syncSourceRef = useRef<'panel' | 'viewport'>('panel')
  const cameraSettingsRef = useRef(cameraSettings)
  cameraSettingsRef.current = cameraSettings
  const onCameraSettingsChangeRef = useRef(onCameraSettingsChange)
  onCameraSettingsChangeRef.current = onCameraSettingsChange
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const [activeTool, setActiveTool] = useState<InspectPanelId | null>(null)
  const objectsRef = useRef<Map<string, Object3D>>(new Map())
  const onLoadingRef = useRef(onLoading)
  const onErrorRef = useRef(onError)
  onLoadingRef.current = onLoading
  onErrorRef.current = onError
  const modelKey = model.path ?? model.mainUrl
  const isProfessional = previewTheme === 'professional'

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
    objectsRef.current = new Map()
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
    if (!displayRoot) {
      objectsRef.current = new Map()
      setHierarchyRoot(null)
      setSelectedId(null)
      return
    }
    const built = buildSceneHierarchy(displayRoot)
    objectsRef.current = built.objects
    setHierarchyRoot(built.root)
  }, [])

  const selectedObject = selectedId ? (objectsRef.current.get(selectedId) ?? null) : null

  const textures = useMemo(
    () => (inspectRoot ? extractTextures(inspectRoot) : []),
    [inspectRoot]
  )
  const materials = useMemo(() => {
    if (!inspectRoot) return []
    const extracted = extractMaterials(inspectRoot)
    return withResolvedMeshIds(extracted, objectsRef.current)
  }, [inspectRoot, hierarchyRoot])
  const geometries = useMemo(() => (modelRoot ? extractGeometries(modelRoot) : []), [modelRoot])
  const sceneInfo = useMemo(
    () =>
      modelRoot
        ? extractSceneInfo(modelRoot, model.label, inspectRoot)
        : null,
    [modelRoot, inspectRoot, model.label]
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

  const handlePick = useCallback((object: Object3D | null) => {
    if (!object) {
      setSelectedId(null)
      return
    }
    const id = object.userData.__hierId as string | undefined
    if (!id) return
    setActiveTool('hierarchy')
    setSelectedId(id)
    setFocusToken(token => token + 1)
  }, [])

  useEffect(() => {
    applyShadingMode(modelRoot, shadingMode)
    if (lightingSettings.mode === 'studio') {
      applyEnvMapIntensity(modelRoot, lightingSettings.envIntensity)
    }
  }, [modelRoot, shadingMode, lightingSettings.envIntensity, lightingSettings.mode])

  const handleToolToggle = useCallback((id: InspectPanelId) => {
    setActiveTool(prev => (prev === id ? null : id))
  }, [])

  const closeActiveTool = useCallback(() => setActiveTool(null), [])

  const interactive = !recording
  const mouseButtons = useMemo(
    () => ({
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    }),
    []
  )

  return (
    <div className="scene-root">
      <ViewportToolbar active={activeTool} onToggle={handleToolToggle} disabled={!modelRoot} />
      {isProfessional && !recording ? (
        <NavGizmoCard apiRef={navGizmoApiRef} orientationRef={navGizmoOrientationRef} />
      ) : null}
      <div className="inspect-dock">
        <HierarchyPanel
          open={activeTool === 'hierarchy'}
          modelKey={modelKey}
          root={hierarchyRoot}
          selectedId={selectedId}
          onOpenChange={open => setActiveTool(open ? 'hierarchy' : null)}
          onSelect={handleHierarchySelect}
          onToggleVisible={handleToggleVisible}
        />
        <TexturesPanel open={activeTool === 'textures'} items={textures} onClose={closeActiveTool} />
        <MaterialsPanel
          open={activeTool === 'materials'}
          items={materials}
          onClose={closeActiveTool}
          onSelectMesh={id => handleHierarchySelect(id)}
        />
        <GeometriesPanel
          open={activeTool === 'geometries'}
          items={geometries}
          onClose={closeActiveTool}
          onSelectMesh={id => handleHierarchySelect(id)}
        />
        <InfoPanel open={activeTool === 'info'} stats={sceneInfo} onClose={closeActiveTool} />
      </div>
      <Canvas
        key={`aa-${msaa ? 'on' : 'off'}`}
        className="scene-canvas"
        style={{ display: 'block', width: '100%', height: '100%', background: sceneBgCss }}
        camera={{
          position: [cameraSettings.posX, cameraSettings.posY, cameraSettings.posZ],
          fov: cameraSettings.fov,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: msaa,
          alpha: false,
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
        {captureRef && <CaptureBridge turntableGroupRef={turntableGroupRef} captureRef={captureRef} />}
        <SceneLighting
          settings={lightingSettings}
          modelRoot={modelRoot}
          previewTheme={previewTheme}
        />
        {isProfessional ? (
          <ProfessionalFloor showAxes={!recording} />
        ) : (
          <>
            <Ground />
            <SoftContactShadow />
          </>
        )}
        <ViewportCameraControls
          syncSourceRef={syncSourceRef}
          cameraSettingsRef={cameraSettingsRef}
          onCameraSettingsChangeRef={onCameraSettingsChangeRef}
          recording={recording}
          navGizmoApiRef={navGizmoApiRef}
          navGizmoOrientationRef={navGizmoOrientationRef}
          isProfessional={isProfessional}
          interactive={interactive}
          mouseButtons={mouseButtons}
          cameraSettings={cameraSettings}
          modelRoot={modelRoot}
          selectedObject={selectedObject}
          focusToken={focusToken}
          onPick={handlePick}
        />
        <Suspense fallback={null}>
          <ModelLoadErrorBoundary resetKey={modelKey} onError={handleLoadError}>
            <TurntableGroup
              recording={recording}
              modelRoot={modelRoot}
              groupRefOut={turntableGroupRef}
            >
              <LoadedModel
                key={`${modelKey}:tex-${maxTextureSize}`}
                model={model}
                maxTextureSize={maxTextureSize}
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
