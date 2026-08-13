import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three'

function isWorldVisible(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

export type ViewportHitSource = 'model' | 'ground' | 'view'

export type ViewportHit = {
  point: Vector3
  normal: Vector3
  source: ViewportHitSource
}

const MODEL_OFFSET = 0.0015
const GROUND_FAR_FACTOR = 10
const MIN_FOCUS_DIST = 0.5

const _ndc = new Vector2()
const _raycaster = new Raycaster()
const _normal = new Vector3()
const _plane = new Plane()
const _hit = new Vector3()
const _camDir = new Vector3()
const _groundOrigin = new Vector3(0, 0, 0)
const _groundNormal = new Vector3(0, 1, 0)

function hitPlaneInFront(maxDistance: number | null): Vector3 | null {
  const point = _raycaster.ray.intersectPlane(_plane, _hit)
  if (!point) return null
  const along =
    (point.x - _raycaster.ray.origin.x) * _raycaster.ray.direction.x +
    (point.y - _raycaster.ray.origin.y) * _raycaster.ray.direction.y +
    (point.z - _raycaster.ray.origin.z) * _raycaster.ray.direction.z
  if (along <= 1e-6) return null
  if (maxDistance != null && along > maxDistance) return null
  return point.clone()
}

/** Raycast: model surface → ground (Y=0) → view plane through the orbit target. */
export function raycastViewport(
  event: PointerEvent,
  element: HTMLElement,
  camera: Camera,
  modelRoot: Object3D | null,
  orbitTarget: Vector3,
  offsetModel = false
): ViewportHit | null {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  _ndc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
  _raycaster.setFromCamera(_ndc, camera)

  if (modelRoot) {
    const hits = _raycaster.intersectObject(modelRoot, true)
    const hit = hits.find(entry => isWorldVisible(entry.object))
    if (hit) {
      if (hit.face) {
        _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize()
      } else {
        _normal.set(0, 1, 0)
      }
      const point = offsetModel ? hit.point.clone().addScaledVector(_normal, MODEL_OFFSET) : hit.point.clone()
      return { point, normal: _normal.clone(), source: 'model' }
    }
  }

  const focusDist = Math.max(camera.position.distanceTo(orbitTarget), MIN_FOCUS_DIST)
  _plane.setFromNormalAndCoplanarPoint(_groundNormal, _groundOrigin)
  const ground = hitPlaneInFront(GROUND_FAR_FACTOR * focusDist)
  if (ground) {
    return { point: ground, normal: _groundNormal.clone(), source: 'ground' }
  }

  camera.getWorldDirection(_camDir)
  _plane.setFromNormalAndCoplanarPoint(_camDir, orbitTarget)
  const view = hitPlaneInFront(null)
  if (!view) return null
  return { point: view, normal: _camDir.clone().negate(), source: 'view' }
}

export function orbitTargetOf(controls: unknown): Vector3 {
  if (controls && typeof controls === 'object' && 'target' in controls) {
    const target = (controls as { target?: Vector3 }).target
    if (target instanceof Vector3) return target
  }
  return _groundOrigin
}
