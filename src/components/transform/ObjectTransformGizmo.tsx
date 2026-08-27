import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AlwaysDepth,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from 'three'
import { isViewCamera, worldSizeFromScreenSize } from '../../lib/cameraFocus'
import {
  applyTransform,
  applyWorldRotationDelta,
  captureTransform,
  closestPointOnAxisFromPointer,
  GIZMO_SCREEN_PX,
  getAxisWorldDirection,
  getViewAxis,
  pickRotateHandle,
  projectPointerToPlane,
  ROTATE_RING_RADIUS,
  ROTATE_SNAP_RAD,
  ROTATE_TRACKBALL_RADIUS,
  SCALE_SNAP,
  signedAngleAroundAxis,
  snapValue,
  trackballRotationDelta,
  TRANSFORM_AXIS_COLOR,
  TRANSLATE_SNAP,
  worldAxisRotation,
  type RotatePickKind,
} from '../../lib/transform/transformMath'
import {
  applyWorldTranslationDelta,
  type TransformHistory,
} from '../../lib/transform/transformHistory'
import type {
  TransformAxis,
  TransformMode,
  TransformSnapshot,
  TransformSpace,
} from '../../lib/transform/transformTypes'

const GIZMO_RENDER_ORDER = 100000
const RING_TUBE = 0.012
const VIEW_RING_RADIUS = 1.2
const ARROW_LEN = 1
const ARROW_RADIUS = 0.018
const ARROW_CONE_LEN = 0.18
const ARROW_CONE_RADIUS = 0.05
const PLANE_SIZE = 0.28
const PLANE_OFFSET = 0.35
const SCALE_BOX = 0.08
const HOVER_SCALE = 1.15

type HandleKind = TransformAxis

type DragState = {
  mode: TransformMode
  axis: HandleKind
  before: TransformSnapshot
  startPoint: Vector3
  axisDir: Vector3
  planeNormal: Vector3
  startWorldPos: Vector3
  startWorldQuat: Quaternion
  startScale: Vector3
  startAngle: number
  pointerId: number
  startNdc: Vector2
  centerNdc: Vector2
  trackballRadiusNdcX: number
  trackballRadiusNdcY: number
}

function makeMat(color: string, opacity = 1) {
  return new MeshBasicMaterial({
    color: new Color(color),
    depthTest: false,
    depthFunc: AlwaysDepth,
    depthWrite: false,
    transparent: opacity < 1,
    opacity,
    side: DoubleSide,
    toneMapped: false,
  })
}

function tagHandle(mesh: Mesh, axis: HandleKind) {
  mesh.userData.__transformHandle = axis
  mesh.userData.__hierarchyIgnore = true
  mesh.renderOrder = GIZMO_RENDER_ORDER
  mesh.frustumCulled = false
}

function createArrow(axis: 'x' | 'y' | 'z', color: string): Group {
  const group = new Group()
  group.userData.__transformHandle = axis
  group.userData.__hierarchyIgnore = true

  const shaft = new Mesh(
    new CylinderGeometry(ARROW_RADIUS, ARROW_RADIUS, ARROW_LEN - ARROW_CONE_LEN, 8),
    makeMat(color)
  )
  shaft.position.y = (ARROW_LEN - ARROW_CONE_LEN) / 2
  tagHandle(shaft, axis)

  const cone = new Mesh(new CylinderGeometry(0, ARROW_CONE_RADIUS, ARROW_CONE_LEN, 12), makeMat(color))
  cone.position.y = ARROW_LEN - ARROW_CONE_LEN / 2
  tagHandle(cone, axis)

  group.add(shaft, cone)
  if (axis === 'x') group.rotation.z = -Math.PI / 2
  else if (axis === 'z') group.rotation.x = Math.PI / 2
  return group
}

function createPlaneHandle(axis: 'xy' | 'yz' | 'xz', color: string): Mesh {
  const geo = new BufferGeometry()
  const s = PLANE_SIZE
  const o = PLANE_OFFSET
  let positions: number[]
  if (axis === 'xy') {
    positions = [o, o, 0, o + s, o, 0, o + s, o + s, 0, o, o, 0, o + s, o + s, 0, o, o + s, 0]
  } else if (axis === 'yz') {
    positions = [0, o, o, 0, o + s, o, 0, o + s, o + s, 0, o, o, 0, o + s, o + s, 0, o, o + s]
  } else {
    positions = [o, 0, o, o + s, 0, o, o + s, 0, o + s, o, 0, o, o + s, 0, o + s, o, 0, o + s]
  }
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mesh = new Mesh(geo, makeMat(color, 0.35))
  tagHandle(mesh, axis)
  return mesh
}

function createScaleHandle(axis: 'x' | 'y' | 'z' | 'xyz', color: string): Mesh {
  const mesh = new Mesh(
    axis === 'xyz'
      ? new SphereGeometry(SCALE_BOX * 0.7, 12, 12)
      : new CylinderGeometry(SCALE_BOX * 0.5, SCALE_BOX * 0.5, SCALE_BOX, 4),
    makeMat(color)
  )
  if (axis !== 'xyz') {
    mesh.rotation.z = Math.PI / 4
    if (axis === 'x') mesh.position.set(ARROW_LEN, 0, 0)
    else if (axis === 'y') mesh.position.set(0, ARROW_LEN, 0)
    else mesh.position.set(0, 0, ARROW_LEN)
  }
  tagHandle(mesh, axis)
  return mesh
}

function createRotateRing(axis: 'x' | 'y' | 'z' | 'view', color: string): Mesh {
  const radius = axis === 'view' ? VIEW_RING_RADIUS : ROTATE_RING_RADIUS
  const mesh = new Mesh(
    new TorusGeometry(radius, RING_TUBE, 12, 64),
    makeMat(color, axis === 'view' ? 0.85 : 1)
  )
  if (axis === 'x') mesh.rotation.y = Math.PI / 2
  else if (axis === 'y') mesh.rotation.x = Math.PI / 2
  tagHandle(mesh, axis)
  return mesh
}

/** Blender-style translucent disc inside the rings — trackball free rotate. */
function createTrackballDisc(): Mesh {
  const mesh = new Mesh(
    new CircleGeometry(ROTATE_TRACKBALL_RADIUS, 48),
    makeMat('#FFFFFF', 0.1)
  )
  tagHandle(mesh, 'trackball')
  mesh.renderOrder = GIZMO_RENDER_ORDER - 1
  return mesh
}

/** Long axis guide shown while dragging a colored rotate ring (Blender infinite axis). */
function createAxisGuideLine(): Mesh {
  const mesh = new Mesh(new CylinderGeometry(0.01, 0.01, 400, 6), makeMat('#EA334C', 0.95))
  mesh.userData.__hierarchyIgnore = true
  mesh.userData.__axisGuide = true
  mesh.renderOrder = GIZMO_RENDER_ORDER + 1
  mesh.frustumCulled = false
  mesh.visible = false
  return mesh
}

function createRadiusGuideLine(): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(0.012, 0.012, ROTATE_RING_RADIUS, 6),
    makeMat('#EA334C', 0.95)
  )
  mesh.userData.__hierarchyIgnore = true
  mesh.userData.__radiusGuide = true
  mesh.renderOrder = GIZMO_RENDER_ORDER + 2
  mesh.frustumCulled = false
  mesh.visible = false
  return mesh
}

const _yUp = new Vector3(0, 1, 0)
const _radialFallback = new Vector3()

/** Unit radial in the rotation plane; never returns a near-zero vector. */
function radialInRotatePlane(axisDir: Vector3, fromCenter: Vector3, out: Vector3): Vector3 {
  out.copy(fromCenter).projectOnPlane(axisDir)
  if (out.lengthSq() > 1e-12) return out.normalize()
  const ref = Math.abs(axisDir.y) < 0.9 ? _radialFallback.set(0, 1, 0) : _radialFallback.set(1, 0, 0)
  out.crossVectors(axisDir, ref)
  if (out.lengthSq() < 1e-12) out.crossVectors(axisDir, _radialFallback.set(0, 0, 1))
  return out.normalize()
}

/** Orient radius mesh so it runs from origin to `endLocal` (on the ring). */
function setRadiusGuideEnd(mesh: Mesh, endLocal: Vector3) {
  const len = endLocal.length()
  if (len < 1e-8) {
    mesh.visible = false
    return
  }
  mesh.scale.set(1, len / ROTATE_RING_RADIUS, 1)
  mesh.quaternion.setFromUnitVectors(_yUp, endLocal.clone().multiplyScalar(1 / len))
  mesh.position.copy(endLocal).multiplyScalar(0.5)
  mesh.visible = true
}

/**
 * Bidirectional arrow cursor aligned to the ring tangent (screen space).
 * Hotspot at center; falls back to ew-resize.
 */
function axisRotateCursorCss(tangentAngleRad: number): string {
  // 180° symmetry — keep angle in a stable range for fewer cursor URL churns.
  let deg = ((tangentAngleRad * 180) / Math.PI) % 180
  if (deg < 0) deg += 180
  deg = Math.round(deg)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<g transform="rotate(${deg} 16 16)" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M5 16h22M9 11 4 16l5 5M23 11l5 5-5 5" stroke="#000" stroke-width="3.5"/>` +
    `<path d="M5 16h22M9 11 4 16l5 5M23 11l5 5-5 5" stroke="#fff" stroke-width="2"/>` +
    `</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, ew-resize`
}

function screenTangentAngle(centerWorld: Vector3, rimWorld: Vector3, camera: import('three').Camera): number {
  const c = centerWorld.clone().project(camera)
  const r = rimWorld.clone().project(camera)
  return Math.atan2(r.y - c.y, r.x - c.x) + Math.PI / 2
}

function pointerNdc(event: PointerEvent, element: HTMLElement, out: Vector2): Vector2 {
  const rect = element.getBoundingClientRect()
  out.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
  return out
}

function resolveHandle(object: Object3D | null): HandleKind | null {
  let current: Object3D | null = object
  while (current) {
    const axis = current.userData.__transformHandle as HandleKind | undefined
    if (axis) return axis
    current = current.parent
  }
  return null
}

function isWorldVisible(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

export type ObjectTransformGizmoProps = {
  object: Object3D | null
  mode: TransformMode
  space?: TransformSpace
  enabled: boolean
  history: TransformHistory
  onDraggingChange?: (dragging: boolean) => void
}

export function ObjectTransformGizmo({
  object,
  mode,
  space = 'global',
  enabled,
  history,
  onDraggingChange,
}: ObjectTransformGizmoProps) {
  const { camera, gl, size, controls } = useThree()
  const rootRef = useRef<Group>(null)
  const translateRef = useRef<Group>(null)
  const rotateRef = useRef<Group>(null)
  const scaleRef = useRef<Group>(null)
  const viewRingRef = useRef<Mesh | null>(null)
  const trackballDiscRef = useRef<Mesh | null>(null)
  const axisGuideRef = useRef<Mesh | null>(null)
  const radiusGuideRef = useRef<Mesh | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const hoverRef = useRef<HandleKind | null>(null)
  const gizmoScaleRef = useRef(1)
  const ndc = useMemo(() => new Vector2(), [])
  const raycaster = useMemo(() => new Raycaster(), [])
  const tmpV = useMemo(() => new Vector3(), [])
  const tmpV2 = useMemo(() => new Vector3(), [])
  const tmpQ = useMemo(() => new Quaternion(), [])
  const objectQuat = useMemo(() => new Quaternion(), [])

  const orbitControls = controls as { enableRotate?: boolean } | null
  const orbitRotateWasRef = useRef(true)

  useEffect(() => {
    const translate = translateRef.current
    const rotate = rotateRef.current
    const scale = scaleRef.current
    if (!translate || !rotate || !scale) return

    const clear = (g: Group) => {
      while (g.children.length) {
        const child = g.children[0]
        g.remove(child)
        child.traverse(obj => {
          if (obj instanceof Mesh) {
            obj.geometry.dispose()
            const mat = obj.material
            if (Array.isArray(mat)) mat.forEach(m => m.dispose())
            else mat.dispose()
          }
        })
      }
    }
    clear(translate)
    clear(rotate)
    clear(scale)

    translate.add(createArrow('x', TRANSFORM_AXIS_COLOR.x))
    translate.add(createArrow('y', TRANSFORM_AXIS_COLOR.y))
    translate.add(createArrow('z', TRANSFORM_AXIS_COLOR.z))
    translate.add(createPlaneHandle('xy', TRANSFORM_AXIS_COLOR.z))
    translate.add(createPlaneHandle('yz', TRANSFORM_AXIS_COLOR.x))
    translate.add(createPlaneHandle('xz', TRANSFORM_AXIS_COLOR.y))

    const disc = createTrackballDisc()
    rotate.add(disc)
    trackballDiscRef.current = disc
    rotate.add(createRotateRing('x', TRANSFORM_AXIS_COLOR.x))
    rotate.add(createRotateRing('y', TRANSFORM_AXIS_COLOR.y))
    rotate.add(createRotateRing('z', TRANSFORM_AXIS_COLOR.z))
    const viewRing = createRotateRing('view', TRANSFORM_AXIS_COLOR.view)
    rotate.add(viewRing)
    viewRingRef.current = viewRing
    const axisGuide = createAxisGuideLine()
    rotate.add(axisGuide)
    axisGuideRef.current = axisGuide
    const radiusGuide = createRadiusGuideLine()
    rotate.add(radiusGuide)
    radiusGuideRef.current = radiusGuide

    scale.add(createScaleHandle('x', TRANSFORM_AXIS_COLOR.x))
    scale.add(createScaleHandle('y', TRANSFORM_AXIS_COLOR.y))
    scale.add(createScaleHandle('z', TRANSFORM_AXIS_COLOR.z))
    scale.add(createScaleHandle('xyz', TRANSFORM_AXIS_COLOR.xyz))

    return () => {
      clear(translate)
      clear(rotate)
      clear(scale)
      viewRingRef.current = null
      trackballDiscRef.current = null
      axisGuideRef.current = null
      radiusGuideRef.current = null
    }
  }, [])

  useFrame(() => {
    const root = rootRef.current
    if (!root || !object || !enabled || !isViewCamera(camera)) {
      if (root) root.visible = false
      return
    }
    root.visible = true
    object.updateMatrixWorld(true)
    object.getWorldPosition(tmpV)
    object.getWorldQuaternion(objectQuat)
    root.position.copy(tmpV)

    if (space === 'local') {
      root.quaternion.copy(objectQuat)
    } else {
      root.quaternion.identity()
    }

    const gizmoScale = worldSizeFromScreenSize(GIZMO_SCREEN_PX, tmpV, camera, size.height)
    gizmoScaleRef.current = gizmoScale
    root.scale.setScalar(gizmoScale)

    if (translateRef.current) translateRef.current.visible = mode === 'translate'
    if (scaleRef.current) scaleRef.current.visible = mode === 'scale'

    const drag = dragRef.current
    const isAxisRotateDrag =
      drag?.mode === 'rotate' && (drag.axis === 'x' || drag.axis === 'y' || drag.axis === 'z')
    const isFreeRotateDrag =
      drag?.mode === 'rotate' && (drag.axis === 'view' || drag.axis === 'trackball')

    // Free rotate (view / trackball): hide whole gizmo. Axis drag: keep group, isolate active ring.
    if (rotateRef.current) {
      rotateRef.current.visible = mode === 'rotate' && !isFreeRotateDrag
    }

    if (mode === 'rotate' && rotateRef.current) {
      rotateRef.current.traverse(child => {
        if (!(child instanceof Mesh)) return
        if (child.userData.__axisGuide || child.userData.__radiusGuide) {
          child.visible = Boolean(isAxisRotateDrag)
          return
        }
        const axis = child.userData.__transformHandle as HandleKind | undefined
        if (!axis) return
        if (isAxisRotateDrag && drag) {
          child.visible = axis === drag.axis
        } else {
          child.visible = true
        }
      })
    }

    if (axisGuideRef.current && isAxisRotateDrag && drag) {
      const guide = axisGuideRef.current
      const mat = guide.material as MeshBasicMaterial
      mat.color.set(TRANSFORM_AXIS_COLOR[drag.axis] ?? '#ffffff')
      // Cylinder default axis is +Y; align to drag axis in gizmo-local space.
      const localDir = tmpV2.copy(drag.axisDir)
      const invRoot = tmpQ.copy(root.quaternion).invert()
      localDir.applyQuaternion(invRoot).normalize()
      if (localDir.lengthSq() > 1e-10) {
        guide.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), localDir)
      }
      guide.position.set(0, 0, 0)
    }

    const faceCamera = (mesh: Mesh | null) => {
      if (!mesh || mode !== 'rotate') return
      const camQuat = camera.getWorldQuaternion(tmpQ)
      if (space === 'local') {
        const inv = objectQuat.clone().invert()
        mesh.quaternion.copy(inv.multiply(camQuat))
      } else {
        mesh.quaternion.copy(camQuat)
      }
      mesh.quaternion.multiply(tmpQ.setFromEuler(new Euler(Math.PI / 2, 0, 0)))
    }
    faceCamera(viewRingRef.current)
    faceCamera(trackballDiscRef.current)

    // Hover highlight — rotate mode: color only (no scale) to avoid pick flicker.
    const active = dragRef.current?.axis ?? hoverRef.current
    root.traverse(child => {
      if (!(child instanceof Mesh)) return
      if (child.userData.__axisGuide || child.userData.__radiusGuide) return
      const axis = child.userData.__transformHandle as HandleKind | undefined
      if (!axis) return
      const mat = child.material as MeshBasicMaterial
      if (axis === 'trackball') {
        mat.opacity = active === 'trackball' ? 0.22 : 0.1
        mat.color.set('#FFFFFF')
        child.scale.setScalar(1)
        return
      }
      const base = TRANSFORM_AXIS_COLOR[axis] ?? '#ffffff'
      // While axis-dragging, keep the active ring in its axis color (Blender).
      if (isAxisRotateDrag && drag && axis === drag.axis) {
        mat.color.set(base)
        child.scale.setScalar(1)
        return
      }
      mat.color.set(active === axis ? '#FFFFFF' : base)
      if (mode === 'rotate') {
        child.scale.setScalar(1)
      } else {
        child.scale.setScalar(active === axis ? HOVER_SCALE : 1)
      }
    })
  })

  useEffect(() => {
    if (!enabled) return
    const element = gl.domElement

    const pickTranslateOrScale = (event: PointerEvent): HandleKind | null => {
      if (!rootRef.current || !object) return null
      pointerNdc(event, element, ndc)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(rootRef.current, true)
      for (const hit of hits) {
        const axis = resolveHandle(hit.object)
        if (axis && axis !== 'trackball' && axis !== 'view') return axis
        if (axis) return axis
      }
      return null
    }

    const pickRotate = (event: PointerEvent): RotatePickKind | null => {
      if (!object || !rootRef.current) return null
      pointerNdc(event, element, ndc)
      object.updateMatrixWorld(true)
      const origin = object.getWorldPosition(new Vector3())
      object.getWorldQuaternion(objectQuat)
      const prev =
        hoverRef.current === 'x' ||
        hoverRef.current === 'y' ||
        hoverRef.current === 'z' ||
        hoverRef.current === 'view' ||
        hoverRef.current === 'trackball'
          ? hoverRef.current
          : null
      const fromGizmo = pickRotateHandle(
        ndc,
        camera,
        origin,
        gizmoScaleRef.current,
        space,
        objectQuat,
        size.width,
        size.height,
        prev
      )
      if (fromGizmo) return fromGizmo

      // Drag on the model itself → trackball (Blender free rotate without grabbing a ring).
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(object, true)
      for (const hit of hits) {
        if (hit.object.userData.__hierarchyIgnore) continue
        if (!isWorldVisible(hit.object)) continue
        return 'trackball'
      }
      return null
    }

    const beginOrbitLock = () => {
      if (orbitControls && typeof orbitControls.enableRotate === 'boolean') {
        orbitRotateWasRef.current = orbitControls.enableRotate
        orbitControls.enableRotate = false
      }
    }

    const endOrbitLock = () => {
      if (orbitControls && typeof orbitControls.enableRotate === 'boolean') {
        orbitControls.enableRotate = orbitRotateWasRef.current
      }
    }

    const fillTrackballDragFields = (
      startWorldPos: Vector3,
      target: {
        startNdc: Vector2
        centerNdc: Vector2
        trackballRadiusNdcX: number
        trackballRadiusNdcY: number
      }
    ) => {
      target.startNdc = ndc.clone()
      const projected = startWorldPos.clone().project(camera)
      target.centerNdc = new Vector2(projected.x, projected.y)
      // Gizmo unit ≈ GIZMO_SCREEN_PX pixels; convert trackball radius to NDC.
      target.trackballRadiusNdcX = (ROTATE_TRACKBALL_RADIUS * GIZMO_SCREEN_PX * 2) / size.width
      target.trackballRadiusNdcY = (ROTATE_TRACKBALL_RADIUS * GIZMO_SCREEN_PX * 2) / size.height
    }

    /** Radius (axis-colored) + tangent bidirectional cursor while dragging a colored ring. */
    const updateAxisRotateFeedback = (drag: DragState, planeHitWorld: Vector3) => {
      const fromCenter = planeHitWorld.clone().sub(drag.startWorldPos)
      const radial = new Vector3()
      radialInRotatePlane(drag.axisDir, fromCenter, radial)

      const rimWorld = drag.startWorldPos
        .clone()
        .addScaledVector(radial, gizmoScaleRef.current * ROTATE_RING_RADIUS)
      element.style.cursor = axisRotateCursorCss(screenTangentAngle(drag.startWorldPos, rimWorld, camera))

      const root = rootRef.current
      const guide = radiusGuideRef.current
      if (!root || !guide) return

      const local = radial.clone()
      const invRoot = root.quaternion.clone().invert()
      local.applyQuaternion(invRoot).normalize().multiplyScalar(ROTATE_RING_RADIUS)

      const axisColor = TRANSFORM_AXIS_COLOR[drag.axis] ?? '#ffffff'
      ;(guide.material as MeshBasicMaterial).color.set(axisColor)
      setRadiusGuideEnd(guide, local)
    }

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !object) {
        if (mode === 'rotate') {
          hoverRef.current = pickRotate(event)
        } else {
          hoverRef.current = pickTranslateOrScale(event)
        }
        element.style.cursor = hoverRef.current ? 'grab' : ''
        return
      }
      if (event.pointerId !== drag.pointerId) return
      pointerNdc(event, element, ndc)
      const ctrl = event.ctrlKey || event.metaKey

      if (drag.mode === 'translate') {
        if (drag.axis === 'x' || drag.axis === 'y' || drag.axis === 'z') {
          if (!closestPointOnAxisFromPointer(ndc, camera, drag.startWorldPos, drag.axisDir, tmpV))
            return
          const deltaLen = tmpV.clone().sub(drag.startPoint).dot(drag.axisDir)
          const snapped = ctrl ? snapValue(deltaLen, TRANSLATE_SNAP) : deltaLen
          applyTransform(object, drag.before)
          applyWorldTranslationDelta(object, drag.axisDir.clone().multiplyScalar(snapped))
        } else {
          if (!projectPointerToPlane(ndc, camera, drag.startWorldPos, drag.planeNormal, tmpV)) return
          const delta = tmpV.clone().sub(drag.startPoint)
          if (ctrl) {
            delta.x = snapValue(delta.x, TRANSLATE_SNAP)
            delta.y = snapValue(delta.y, TRANSLATE_SNAP)
            delta.z = snapValue(delta.z, TRANSLATE_SNAP)
          }
          applyTransform(object, drag.before)
          applyWorldTranslationDelta(object, delta)
        }
      } else if (drag.mode === 'rotate') {
        if (drag.axis === 'trackball') {
          element.style.cursor = 'move'
          applyTransform(object, drag.before)
          trackballRotationDelta(
            drag.startNdc,
            ndc,
            drag.centerNdc,
            drag.trackballRadiusNdcX,
            drag.trackballRadiusNdcY,
            camera,
            tmpQ
          )
          applyWorldRotationDelta(object, tmpQ)
        } else if (drag.axis === 'view') {
          element.style.cursor = 'move'
          if (!projectPointerToPlane(ndc, camera, drag.startWorldPos, drag.axisDir, tmpV)) {
            const start = drag.startNdc
            const a0 = Math.atan2(start.y - drag.centerNdc.y, start.x - drag.centerNdc.x)
            const a1 = Math.atan2(ndc.y - drag.centerNdc.y, ndc.x - drag.centerNdc.x)
            let angle = a1 - a0
            if (ctrl) angle = snapValue(angle, ROTATE_SNAP_RAD)
            applyTransform(object, drag.before)
            worldAxisRotation(drag.axisDir, angle, tmpQ)
            applyWorldRotationDelta(object, tmpQ)
            return
          }
          const from = drag.startPoint.clone().sub(drag.startWorldPos)
          const to = tmpV.clone().sub(drag.startWorldPos)
          let angle = signedAngleAroundAxis(from, to, drag.axisDir)
          if (ctrl) angle = snapValue(angle, ROTATE_SNAP_RAD)
          applyTransform(object, drag.before)
          worldAxisRotation(drag.axisDir, angle, tmpQ)
          applyWorldRotationDelta(object, tmpQ)
        } else {
          // Colored axis ring: constrained rotate + radius guide + tangent cursor.
          if (!projectPointerToPlane(ndc, camera, drag.startWorldPos, drag.axisDir, tmpV)) {
            const start = drag.startNdc
            const a0 = Math.atan2(start.y - drag.centerNdc.y, start.x - drag.centerNdc.x)
            const a1 = Math.atan2(ndc.y - drag.centerNdc.y, ndc.x - drag.centerNdc.x)
            let angle = a1 - a0
            if (ctrl) angle = snapValue(angle, ROTATE_SNAP_RAD)
            applyTransform(object, drag.before)
            worldAxisRotation(drag.axisDir, angle, tmpQ)
            applyWorldRotationDelta(object, tmpQ)
            // Approximate rim from screen angle for feedback.
            const rimNdc = new Vector2(
              drag.centerNdc.x + Math.cos(a1) * 0.15,
              drag.centerNdc.y + Math.sin(a1) * 0.15
            )
            element.style.cursor = axisRotateCursorCss(
              Math.atan2(rimNdc.y - drag.centerNdc.y, rimNdc.x - drag.centerNdc.x) + Math.PI / 2
            )
            return
          }
          updateAxisRotateFeedback(drag, tmpV)
          const from = drag.startPoint.clone().sub(drag.startWorldPos)
          const to = tmpV.clone().sub(drag.startWorldPos)
          let angle = signedAngleAroundAxis(from, to, drag.axisDir)
          if (ctrl) angle = snapValue(angle, ROTATE_SNAP_RAD)
          applyTransform(object, drag.before)
          worldAxisRotation(drag.axisDir, angle, tmpQ)
          applyWorldRotationDelta(object, tmpQ)
        }
      } else if (drag.mode === 'scale') {
        if (drag.axis === 'xyz') {
          if (!projectPointerToPlane(ndc, camera, drag.startWorldPos, getViewAxis(camera, tmpV2), tmpV))
            return
          const startDist = drag.startPoint.distanceTo(drag.startWorldPos) || 1e-6
          const curDist = tmpV.distanceTo(drag.startWorldPos)
          let factor = curDist / startDist
          if (ctrl) factor = snapValue(factor, SCALE_SNAP)
          applyTransform(object, drag.before)
          object.scale.copy(drag.startScale).multiplyScalar(Math.max(1e-4, factor))
        } else if (drag.axis === 'x' || drag.axis === 'y' || drag.axis === 'z') {
          if (!closestPointOnAxisFromPointer(ndc, camera, drag.startWorldPos, drag.axisDir, tmpV))
            return
          const startOff = drag.startPoint.clone().sub(drag.startWorldPos).dot(drag.axisDir)
          const curOff = tmpV.clone().sub(drag.startWorldPos).dot(drag.axisDir)
          let factor = curOff / (Math.abs(startOff) < 1e-6 ? 1e-6 : startOff)
          if (ctrl) factor = snapValue(factor, SCALE_SNAP)
          applyTransform(object, drag.before)
          const sx = drag.axis === 'x' ? Math.max(1e-4, drag.startScale.x * factor) : drag.startScale.x
          const sy = drag.axis === 'y' ? Math.max(1e-4, drag.startScale.y * factor) : drag.startScale.y
          const sz = drag.axis === 'z' ? Math.max(1e-4, drag.startScale.z * factor) : drag.startScale.z
          object.scale.set(sx, sy, sz)
        }
        object.updateMatrixWorld(true)
      }
    }

    const endDrag = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId || !object) return
      dragRef.current = null
      endOrbitLock()
      onDraggingChange?.(false)
      element.style.cursor = ''
      try {
        element.releasePointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
      const hierId = object.userData.__hierId as string | undefined
      if (hierId) history.commit(hierId, drag.before, object)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !object) return

      let axis: HandleKind | null = null
      if (mode === 'rotate') {
        axis = pickRotate(event)
      } else {
        axis = pickTranslateOrScale(event)
      }
      if (!axis) return

      event.preventDefault()
      event.stopPropagation()
      pointerNdc(event, element, ndc)

      object.updateMatrixWorld(true)
      const startWorldPos = object.getWorldPosition(new Vector3())
      const startWorldQuat = object.getWorldQuaternion(new Quaternion())
      const startScale = object.scale.clone()
      const before = captureTransform(object)

      const axisDir = new Vector3()
      const planeNormal = new Vector3()
      const startPoint = new Vector3()
      const trackballFields = {
        startNdc: ndc.clone(),
        centerNdc: new Vector2(),
        trackballRadiusNdcX: 0.2,
        trackballRadiusNdcY: 0.2,
      }
      fillTrackballDragFields(startWorldPos, trackballFields)

      if (mode === 'rotate') {
        if (axis === 'trackball') {
          getViewAxis(camera, axisDir)
          planeNormal.copy(axisDir)
          startPoint.copy(startWorldPos)
        } else if (axis === 'view') {
          getViewAxis(camera, axisDir)
          planeNormal.copy(axisDir)
          if (!projectPointerToPlane(ndc, camera, startWorldPos, planeNormal, startPoint)) {
            startPoint.copy(startWorldPos).add(axisDir)
          }
        } else if (axis === 'x' || axis === 'y' || axis === 'z') {
          getAxisWorldDirection(axis, space, startWorldQuat, axisDir)
          planeNormal.copy(axisDir)
          if (!projectPointerToPlane(ndc, camera, startWorldPos, planeNormal, startPoint)) {
            startPoint.copy(startWorldPos).add(axisDir)
          }
        } else {
          return
        }
      } else if (mode === 'translate') {
        if (axis === 'x' || axis === 'y' || axis === 'z') {
          getAxisWorldDirection(axis, space, startWorldQuat, axisDir)
          planeNormal.copy(getViewAxis(camera, tmpV2))
          if (!closestPointOnAxisFromPointer(ndc, camera, startWorldPos, axisDir, startPoint)) {
            startPoint.copy(startWorldPos)
          }
        } else if (axis === 'xy' || axis === 'yz' || axis === 'xz') {
          if (axis === 'xy') planeNormal.set(0, 0, 1)
          else if (axis === 'yz') planeNormal.set(1, 0, 0)
          else planeNormal.set(0, 1, 0)
          if (space === 'local') planeNormal.applyQuaternion(startWorldQuat)
          planeNormal.normalize()
          if (!projectPointerToPlane(ndc, camera, startWorldPos, planeNormal, startPoint)) {
            startPoint.copy(startWorldPos)
          }
        } else {
          return
        }
      } else {
        if (axis === 'xyz') {
          getViewAxis(camera, planeNormal)
          axisDir.copy(planeNormal)
          if (!projectPointerToPlane(ndc, camera, startWorldPos, planeNormal, startPoint)) {
            startPoint.copy(startWorldPos).add(new Vector3(1, 0, 0))
          }
        } else if (axis === 'x' || axis === 'y' || axis === 'z') {
          getAxisWorldDirection(axis, space, startWorldQuat, axisDir)
          if (!closestPointOnAxisFromPointer(ndc, camera, startWorldPos, axisDir, startPoint)) {
            startPoint.copy(startWorldPos).add(axisDir)
          }
        } else {
          return
        }
      }

      dragRef.current = {
        mode,
        axis,
        before,
        startPoint: startPoint.clone(),
        axisDir: axisDir.clone().normalize(),
        planeNormal: planeNormal.clone().normalize(),
        startWorldPos,
        startWorldQuat,
        startScale,
        startAngle: 0,
        pointerId: event.pointerId,
        startNdc: trackballFields.startNdc,
        centerNdc: trackballFields.centerNdc,
        trackballRadiusNdcX: trackballFields.trackballRadiusNdcX,
        trackballRadiusNdcY: trackballFields.trackballRadiusNdcY,
      }
      beginOrbitLock()
      onDraggingChange?.(true)
      element.setPointerCapture(event.pointerId)
      if (mode === 'rotate' && (axis === 'x' || axis === 'y' || axis === 'z') && dragRef.current) {
        updateAxisRotateFeedback(dragRef.current, startPoint)
      } else if (mode === 'rotate') {
        element.style.cursor = 'move'
      } else {
        element.style.cursor = 'grabbing'
      }
    }

    element.addEventListener('pointerdown', onPointerDown, true)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', endDrag)
    element.addEventListener('pointercancel', endDrag)

    const onKeyDown = (event: KeyboardEvent) => {
      const drag = dragRef.current
      if (!drag || !object || drag.mode !== 'rotate') return
      const key = event.key.toLowerCase()
      if (key !== 'x' && key !== 'y' && key !== 'z') return
      event.preventDefault()
      getAxisWorldDirection(key, space, drag.startWorldQuat, drag.axisDir)
      drag.axis = key
      drag.planeNormal.copy(drag.axisDir)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown, true)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', endDrag)
      element.removeEventListener('pointercancel', endDrag)
      window.removeEventListener('keydown', onKeyDown)
      if (dragRef.current) {
        dragRef.current = null
        endOrbitLock()
        onDraggingChange?.(false)
      }
      element.style.cursor = ''
    }
  }, [
    enabled,
    object,
    mode,
    space,
    camera,
    gl,
    size.width,
    size.height,
    controls,
    history,
    onDraggingChange,
    ndc,
    raycaster,
    tmpV,
    tmpV2,
    tmpQ,
    objectQuat,
    orbitControls,
  ])

  return (
    <group ref={rootRef} userData={{ __hierarchyIgnore: true }} visible={Boolean(enabled && object)}>
      <group ref={translateRef} />
      <group ref={rotateRef} />
      <group ref={scaleRef} />
    </group>
  )
}
