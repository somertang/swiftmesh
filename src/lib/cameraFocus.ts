import { Box3, MathUtils, Vector3, type PerspectiveCamera, type Object3D } from 'three'
import type { CameraSettings } from '../config/cameraDefaults'

type ControlsLike = {
  target: Vector3
  update: () => void
}

const CAMERA_SETTINGS_EPS = 1e-4

/** Snapshot live camera + orbit target into panel settings shape. */
export function readCameraSettings(
  camera: PerspectiveCamera,
  controls: ControlsLike | null | undefined
): CameraSettings {
  const target = controls?.target
  return {
    posX: camera.position.x,
    posY: camera.position.y,
    posZ: camera.position.z,
    targetX: target?.x ?? 0,
    targetY: target?.y ?? 0,
    targetZ: target?.z ?? 0,
    fov: camera.fov,
  }
}

function nearlyEqual(a: number, b: number, eps = CAMERA_SETTINGS_EPS) {
  return Math.abs(a - b) <= eps
}

/** True when two camera settings match within a small float tolerance. */
export function cameraSettingsEqual(a: CameraSettings, b: CameraSettings, eps = CAMERA_SETTINGS_EPS) {
  return (
    nearlyEqual(a.posX, b.posX, eps) &&
    nearlyEqual(a.posY, b.posY, eps) &&
    nearlyEqual(a.posZ, b.posZ, eps) &&
    nearlyEqual(a.targetX, b.targetX, eps) &&
    nearlyEqual(a.targetY, b.targetY, eps) &&
    nearlyEqual(a.targetZ, b.targetZ, eps) &&
    nearlyEqual(a.fov, b.fov, eps)
  )
}

/** Fit camera to an object bbox — mirrors glb-viewer-core `focus_camera_on_object`. */
export function focusCameraOnObject(
  object: Object3D,
  camera: PerspectiveCamera,
  controls: ControlsLike | null | undefined
) {
  const box = new Box3().setFromObject(object)
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())

  let maxRadius = 0.01
  if (center.length() < 0.001) {
    object.getWorldPosition(center)
    maxRadius = 0.25
  }

  const boundingSphereRadius = size.length() / 2
  const fov = MathUtils.degToRad(camera.fov)
  const aspect = camera.aspect || 1

  const distanceForHeight = Math.max(maxRadius, boundingSphereRadius) / Math.sin(fov / 2)
  const distanceForWidth =
    Math.max(maxRadius, boundingSphereRadius) / Math.sin(Math.atan(Math.tan(fov / 2) * aspect))
  const fitDistance = Math.max(distanceForHeight, distanceForWidth) * 1.2

  const direction = new Vector3()
  camera.getWorldDirection(direction)
  direction.negate()
  camera.position.copy(center.clone().add(direction.multiplyScalar(fitDistance)))
  camera.far = Math.max(camera.far, fitDistance + size.length())
  camera.updateProjectionMatrix()

  if (controls) {
    controls.target.copy(center)
    controls.update()
  }
}

export function resolveHierarchyObject(object: Object3D): Object3D | null {
  let current: Object3D | null = object
  while (current) {
    if (typeof current.userData.__hierId === 'string') return current
    current = current.parent
  }
  return null
}

export function worldSizeFromScreenSize(
  desiredScreenPx: number,
  targetPos: Vector3,
  camera: PerspectiveCamera,
  viewportHeightPx: number
) {
  const vFov = (camera.fov * Math.PI) / 180
  const heightAtDistance = 2 * Math.tan(vFov / 2) * camera.position.distanceTo(targetPos)
  return (desiredScreenPx / Math.max(viewportHeightPx, 1)) * heightAtDistance
}
