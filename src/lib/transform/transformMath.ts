import { MathUtils, Quaternion, Vector2, Vector3, type Camera, type Object3D } from 'three'
import type { TransformAxis, TransformSnapshot } from './transformTypes'

const AXIS_COLORS = {
  x: '#EA334C',
  y: '#80CA1E',
  z: '#2D83E8',
  view: '#E8E8E8',
  trackball: '#FFFFFF',
  xy: '#EA334C',
  yz: '#80CA1E',
  xz: '#2D83E8',
  xyz: '#FFFFFF',
} as const

export const TRANSFORM_AXIS_COLOR: Record<TransformAxis, string> = AXIS_COLORS

/** Approx. on-screen gizmo unit size used when sizing the widget (see ObjectTransformGizmo). */
export const GIZMO_SCREEN_PX = 70
export const ROTATE_RING_RADIUS = 1
export const ROTATE_VIEW_RING_RADIUS = 1.2
export const ROTATE_TRACKBALL_RADIUS = 0.85
/** Pixel hit slop for colored / view rings. */
export const ROTATE_RING_PICK_PX = 16

export const ROTATE_SNAP_RAD = MathUtils.degToRad(15)
export const TRANSLATE_SNAP = 0.1
export const SCALE_SNAP = 0.1

const _v = new Vector3()
const _v2 = new Vector3()
const _q = new Quaternion()

export function captureTransform(object: Object3D): TransformSnapshot {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    quaternion: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  }
}

export function applyTransform(object: Object3D, snap: TransformSnapshot) {
  object.position.set(...snap.position)
  object.quaternion.set(...snap.quaternion)
  object.scale.set(...snap.scale)
  object.updateMatrixWorld(true)
}

export function transformsEqual(a: TransformSnapshot, b: TransformSnapshot, eps = 1e-8): boolean {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.position[i] - b.position[i]) > eps) return false
    if (Math.abs(a.scale[i] - b.scale[i]) > eps) return false
  }
  for (let i = 0; i < 4; i++) {
    if (Math.abs(a.quaternion[i] - b.quaternion[i]) > eps) return false
  }
  return true
}

/** Signed angle around `axis` from startDir to currentDir (both in plane ⊥ axis). */
export function signedAngleAroundAxis(
  startDir: Vector3,
  currentDir: Vector3,
  axis: Vector3
): number {
  const a = startDir.clone().projectOnPlane(axis).normalize()
  const b = currentDir.clone().projectOnPlane(axis).normalize()
  if (a.lengthSq() < 1e-10 || b.lengthSq() < 1e-10) return 0
  const cross = _v.crossVectors(a, b)
  const sin = cross.dot(axis)
  const cos = a.dot(b)
  return Math.atan2(sin, cos)
}

export function snapValue(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

const _origin = new Vector3()
const _dir = new Vector3()

export function projectPointerToPlane(
  ndc: Vector2,
  camera: Camera,
  planePoint: Vector3,
  planeNormal: Vector3,
  out: Vector3
): boolean {
  camera.getWorldPosition(_origin)
  _dir.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(_origin).normalize()
  const denom = planeNormal.dot(_dir)
  if (Math.abs(denom) < 1e-8) return false
  const t = planeNormal.dot(_v.copy(planePoint).sub(_origin)) / denom
  if (!Number.isFinite(t)) return false
  out.copy(_origin).addScaledVector(_dir, t)
  return true
}

/** Closest point on an infinite axis line to a ray from the camera through NDC. */
export function closestPointOnAxisFromPointer(
  ndc: Vector2,
  camera: Camera,
  axisOrigin: Vector3,
  axisDir: Vector3,
  out: Vector3
): boolean {
  const rayOrigin = camera.getWorldPosition(new Vector3())
  const rayDir = new Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(rayOrigin).normalize()

  const w0 = rayOrigin.clone().sub(axisOrigin)
  const a = rayDir.dot(rayDir)
  const b = rayDir.dot(axisDir)
  const c = axisDir.dot(axisDir)
  const d = rayDir.dot(w0)
  const e = axisDir.dot(w0)
  const denom = a * c - b * b
  if (Math.abs(denom) < 1e-10) return false
  const tAxis = (a * e - b * d) / denom
  out.copy(axisOrigin).addScaledVector(axisDir, tAxis)
  return true
}

export function getAxisWorldDirection(
  axis: 'x' | 'y' | 'z',
  space: 'global' | 'local',
  objectWorldQuat: Quaternion,
  out: Vector3
): Vector3 {
  if (axis === 'x') out.set(1, 0, 0)
  else if (axis === 'y') out.set(0, 1, 0)
  else out.set(0, 0, 1)
  if (space === 'local') out.applyQuaternion(objectWorldQuat)
  return out.normalize()
}

export function getViewAxis(camera: Camera, out: Vector3): Vector3 {
  camera.getWorldDirection(out)
  return out.normalize()
}

/** Build a world quaternion that rotates `deltaRad` around world-space `axis`. */
export function worldAxisRotation(axis: Vector3, deltaRad: number, out: Quaternion): Quaternion {
  return out.setFromAxisAngle(axis.clone().normalize(), deltaRad)
}

/** Apply a world-space rotation delta to an object's local quaternion. */
export function applyWorldRotationDelta(object: Object3D, worldDelta: Quaternion) {
  object.updateMatrixWorld(true)
  const parent = object.parent
  if (parent) {
    parent.matrixWorld.decompose(_v, _q, _v2)
    // local' = parentWorldQuat^{-1} * worldDelta * parentWorldQuat * local
    const parentWorld = _q.clone()
    const parentInv = parentWorld.clone().invert()
    const localDelta = parentInv.multiply(worldDelta.clone()).multiply(parentWorld)
    object.quaternion.premultiply(localDelta)
  } else {
    object.quaternion.premultiply(worldDelta)
  }
  object.updateMatrixWorld(true)
}

function worldToNdc(world: Vector3, camera: Camera, out: Vector2): Vector2 {
  _v.copy(world).project(camera)
  return out.set(_v.x, _v.y)
}

function ndcDeltaToPixels(a: Vector2, b: Vector2, width: number, height: number): number {
  const dx = ((a.x - b.x) * width) / 2
  const dy = ((a.y - b.y) * height) / 2
  return Math.hypot(dx, dy)
}

function orthonormalBasis(axis: Vector3, outU: Vector3, outV: Vector3) {
  if (Math.abs(axis.y) < 0.9) outU.set(0, 1, 0).cross(axis).normalize()
  else outU.set(1, 0, 0).cross(axis).normalize()
  outV.copy(axis).cross(outU).normalize()
}

/** Min pixel distance from an NDC pointer to a world-space circle (sampled). */
export function screenDistToWorldCircle(
  pointerNdc: Vector2,
  camera: Camera,
  center: Vector3,
  axis: Vector3,
  radius: number,
  viewportWidth: number,
  viewportHeight: number,
  samples = 64
): number {
  const u = new Vector3()
  const v = new Vector3()
  orthonormalBasis(axis, u, v)
  const p = new Vector3()
  const pNdc = new Vector2()
  let minDist = Infinity
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2
    p.copy(center).addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius)
    worldToNdc(p, camera, pNdc)
    minDist = Math.min(minDist, ndcDeltaToPixels(pointerNdc, pNdc, viewportWidth, viewportHeight))
  }
  return minDist
}

export type RotatePickKind = 'x' | 'y' | 'z' | 'view' | 'trackball'

/**
 * Blender-like rotate gizmo pick: screen distance to rings, prefer edge-on axes,
 * then view ring, then inner trackball disc. Does not use mesh raycasts (avoids
 * hover-scale flicker at ring intersections).
 *
 * The inner disc wins near the gizmo center (edge-on rings project through the
 * origin and would otherwise steal every hover at the cross).
 */
export function pickRotateHandle(
  pointerNdc: Vector2,
  camera: Camera,
  gizmoOrigin: Vector3,
  gizmoWorldScale: number,
  space: 'global' | 'local',
  objectWorldQuat: Quaternion,
  viewportWidth: number,
  viewportHeight: number,
  previous: RotatePickKind | null = null
): RotatePickKind | null {
  const viewDir = getViewAxis(camera, new Vector3())
  const centerNdc = new Vector2()
  worldToNdc(gizmoOrigin, camera, centerNdc)
  const centerPx = ndcDeltaToPixels(pointerNdc, centerNdc, viewportWidth, viewportHeight)

  const ringWorldR = ROTATE_RING_RADIUS * gizmoWorldScale
  const viewWorldR = ROTATE_VIEW_RING_RADIUS * gizmoWorldScale
  const trackballPx = ROTATE_TRACKBALL_RADIUS * GIZMO_SCREEN_PX
  const hysteresis = previous ? 4 : 0
  const ringThresh = ROTATE_RING_PICK_PX + hysteresis

  type Cand = { kind: RotatePickKind; dist: number; edgeOn: number }
  const rings: Cand[] = []

  for (const axis of ['x', 'y', 'z'] as const) {
    const axisDir = getAxisWorldDirection(axis, space, objectWorldQuat, new Vector3())
    const dist = screenDistToWorldCircle(
      pointerNdc,
      camera,
      gizmoOrigin,
      axisDir,
      ringWorldR,
      viewportWidth,
      viewportHeight
    )
    const edgeOn = 1 - Math.min(1, Math.abs(axisDir.dot(viewDir)))
    const thresh = previous === axis ? ringThresh : ROTATE_RING_PICK_PX
    if (dist <= thresh) {
      rings.push({ kind: axis, dist, edgeOn })
    }
  }

  rings.sort((a, b) => {
    if (Math.abs(a.dist - b.dist) > 2) return a.dist - b.dist
    return b.edgeOn - a.edgeOn
  })
  const bestRing = rings[0] ?? null

  const viewDist = screenDistToWorldCircle(
    pointerNdc,
    camera,
    gizmoOrigin,
    viewDir,
    viewWorldR,
    viewportWidth,
    viewportHeight
  )
  const viewThresh = previous === 'view' ? ringThresh : ROTATE_RING_PICK_PX
  const onViewRing = viewDist <= viewThresh

  const trackballThresh = previous === 'trackball' ? trackballPx + hysteresis : trackballPx
  const inTrackball = centerPx <= trackballThresh

  // Inner disc: trackball, unless clearly on a colored rim (outer part of the disc).
  if (inTrackball) {
    const onColoredRim = centerPx >= trackballPx * 0.62 && bestRing && bestRing.dist <= ROTATE_RING_PICK_PX
    if (onColoredRim) return bestRing.kind
    return 'trackball'
  }

  if (bestRing) return bestRing.kind
  if (onViewRing) return 'view'
  return null
}

/**
 * Shoemake-style virtual trackball: map NDC offsets (relative to gizmo center) to a
 * unit vector on a sphere / hyperbola, then build the world rotation taking start→current.
 */
export function trackballPointerVector(
  pointerNdc: Vector2,
  centerNdc: Vector2,
  radiusNdcX: number,
  radiusNdcY: number,
  out: Vector3
): Vector3 {
  const x = radiusNdcX > 1e-8 ? (pointerNdc.x - centerNdc.x) / radiusNdcX : 0
  const y = radiusNdcY > 1e-8 ? (pointerNdc.y - centerNdc.y) / radiusNdcY : 0
  const r2 = x * x + y * y
  let z: number
  if (r2 <= 0.5) z = Math.sqrt(Math.max(0, 1 - r2))
  else z = 0.5 / Math.sqrt(r2)
  return out.set(x, y, z).normalize()
}

export function trackballRotationDelta(
  startNdc: Vector2,
  currentNdc: Vector2,
  centerNdc: Vector2,
  radiusNdcX: number,
  radiusNdcY: number,
  camera: Camera,
  out: Quaternion
): Quaternion {
  const a = trackballPointerVector(startNdc, centerNdc, radiusNdcX, radiusNdcY, new Vector3())
  const b = trackballPointerVector(currentNdc, centerNdc, radiusNdcX, radiusNdcY, new Vector3())
  const camQuat = camera.getWorldQuaternion(new Quaternion())
  a.applyQuaternion(camQuat)
  b.applyQuaternion(camQuat)
  if (a.dot(b) > 0.999999) return out.identity()
  return out.setFromUnitVectors(a, b)
}

