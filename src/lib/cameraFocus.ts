import {
  Box3,
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Spherical,
  Vector3,
  type Camera,
  type Object3D,
} from 'three'
import {
  DEFAULT_CAMERA,
  type CameraProjection,
  type CameraSettings,
  type RecordProjection,
} from '../config/cameraDefaults'

export type ViewCamera = PerspectiveCamera | OrthographicCamera

type ControlsLike = {
  target: Vector3
  update: () => void
}

export function isViewCamera(camera: Camera): camera is ViewCamera {
  return camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera
}

const CAMERA_SETTINGS_EPS = 1e-4
/** Keep away from poles to avoid orbit gimbal lock (matches NavGizmo). */
const PHI_EPS = 0.05

export function getVirtualFov(camera: ViewCamera, fallback = DEFAULT_CAMERA.fov): number {
  if (camera instanceof PerspectiveCamera) return camera.fov
  const stored = camera.userData?.virtualFov
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback
}

function setVirtualFov(camera: ViewCamera, fov: number) {
  camera.userData.virtualFov = fov
}

export function getCameraAspect(camera: ViewCamera): number {
  if (camera instanceof PerspectiveCamera) return camera.aspect || 1
  if (camera instanceof OrthographicCamera) {
    const h = camera.top - camera.bottom
    if (Math.abs(h) < 1e-12) return 1
    return Math.abs((camera.right - camera.left) / h)
  }
  return 1
}

/** Match ortho frustum to a perspective view at zoom=1 (OrbitControls zoom stacks). */
export function syncOrthoFrustum(
  camera: OrthographicCamera,
  fovDeg: number,
  distance: number,
  aspect: number
) {
  const halfHeight = Math.tan(MathUtils.degToRad(fovDeg) / 2) * Math.max(distance, 0.001)
  const halfWidth = halfHeight * Math.max(aspect, 0.0001)
  camera.top = halfHeight
  camera.bottom = -halfHeight
  camera.left = -halfWidth
  camera.right = halfWidth
}

/**
 * Switch projection while keeping framing. Ortho zoom is baked into distance
 * when returning to perspective so the model does not jump in size.
 */
export function withCameraProjection(
  settings: CameraSettings,
  projection: CameraProjection
): CameraSettings {
  if (settings.projection === projection) return settings
  if (projection === 'orthographic') {
    return { ...settings, projection, zoom: 1 }
  }

  const target = new Vector3(settings.targetX, settings.targetY, settings.targetZ)
  const pos = new Vector3(settings.posX, settings.posY, settings.posZ)
  const zoom = Math.max(settings.zoom, 0.001)
  const offset = pos.clone().sub(target)
  if (offset.lengthSq() < 1e-12) {
    return { ...settings, projection: 'perspective', zoom: 1 }
  }
  offset.setLength(offset.length() / zoom)
  const next = target.clone().add(offset)
  return {
    ...settings,
    projection: 'perspective',
    zoom: 1,
    posX: next.x,
    posY: next.y,
    posZ: next.z,
  }
}

/** Resolve the camera pose used for a recording from the live view + record preference. */
export function cameraForRecording(
  live: CameraSettings,
  mode: RecordProjection | undefined
): CameraSettings {
  if (!mode || mode === 'viewport') return live
  return withCameraProjection(live, mode)
}

/** Snapshot live camera + orbit target into panel settings shape. */
export function readCameraSettings(
  camera: ViewCamera,
  controls: ControlsLike | null | undefined,
  previous?: CameraSettings
): CameraSettings {
  const target = controls?.target
  const isOrtho = camera instanceof OrthographicCamera
  return {
    posX: camera.position.x,
    posY: camera.position.y,
    posZ: camera.position.z,
    targetX: target?.x ?? 0,
    targetY: target?.y ?? 0,
    targetZ: target?.z ?? 0,
    fov: camera instanceof PerspectiveCamera ? camera.fov : (previous?.fov ?? getVirtualFov(camera)),
    projection: isOrtho ? 'orthographic' : 'perspective',
    zoom: isOrtho ? camera.zoom : 1,
  }
}

function nearlyEqual(a: number, b: number, eps = CAMERA_SETTINGS_EPS) {
  return Math.abs(a - b) <= eps
}

/** True when two camera settings match within a small float tolerance. */
export function cameraSettingsEqual(a: CameraSettings, b: CameraSettings, eps = CAMERA_SETTINGS_EPS) {
  return (
    a.projection === b.projection &&
    nearlyEqual(a.posX, b.posX, eps) &&
    nearlyEqual(a.posY, b.posY, eps) &&
    nearlyEqual(a.posZ, b.posZ, eps) &&
    nearlyEqual(a.targetX, b.targetX, eps) &&
    nearlyEqual(a.targetY, b.targetY, eps) &&
    nearlyEqual(a.targetZ, b.targetZ, eps) &&
    nearlyEqual(a.fov, b.fov, eps) &&
    nearlyEqual(a.zoom, b.zoom, eps)
  )
}

export function applyCameraSettings(
  camera: ViewCamera,
  controls: ControlsLike | null | undefined,
  cameraSettings: CameraSettings,
  aspect?: number
) {
  camera.position.set(cameraSettings.posX, cameraSettings.posY, cameraSettings.posZ)
  camera.near = 0.1
  camera.far = 100
  setVirtualFov(camera, cameraSettings.fov)

  const asp = aspect ?? getCameraAspect(camera)
  if (camera instanceof PerspectiveCamera) {
    camera.fov = cameraSettings.fov
    camera.zoom = 1
    if (aspect) camera.aspect = aspect
  } else if (camera instanceof OrthographicCamera) {
    camera.zoom = Math.max(cameraSettings.zoom, 0.001)
    const target = new Vector3(cameraSettings.targetX, cameraSettings.targetY, cameraSettings.targetZ)
    const distance = Math.max(camera.position.distanceTo(target), 0.001)
    syncOrthoFrustum(camera, cameraSettings.fov, distance, asp)
  }
  camera.updateProjectionMatrix()

  if (!controls) return
  controls.target.set(cameraSettings.targetX, cameraSettings.targetY, cameraSettings.targetZ)
  controls.update()
}

function objectFitMetrics(object: Object3D) {
  const box = new Box3().setFromObject(object)
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  let maxRadius = 0.01
  if (center.length() < 0.001) {
    object.getWorldPosition(center)
    maxRadius = 0.25
  }
  return {
    center,
    size,
    radius: Math.max(maxRadius, size.length() / 2),
  }
}

function fitDistanceFromRadius(radius: number, fovDeg: number, aspect: number): number {
  const fov = MathUtils.degToRad(fovDeg)
  const safeAspect = Math.max(aspect, 0.0001)
  const distanceForHeight = radius / Math.sin(fov / 2)
  const distanceForWidth = radius / Math.sin(Math.atan(Math.tan(fov / 2) * safeAspect))
  return Math.max(distanceForHeight, distanceForWidth) * 1.2
}

/** Camera distance used by `focusCameraOnObject` for the given FOV and aspect. */
export function fitDistanceForObject(object: Object3D, fovDeg: number, aspect: number): number {
  return fitDistanceFromRadius(objectFitMetrics(object).radius, fovDeg, aspect)
}

/**
 * Viewport zoom vs a fitted view: 1 = framed to the model (100%).
 * Orthographic uses `settings.zoom`; perspective uses fitDistance / currentDistance.
 */
export function viewZoomFactor(
  settings: CameraSettings,
  object: Object3D | null,
  aspect = 1
): number | null {
  if (settings.projection === 'orthographic') {
    const zoom = settings.zoom
    if (!Number.isFinite(zoom) || zoom <= 0) return null
    return zoom
  }
  if (!object) return null
  const current = Math.hypot(
    settings.posX - settings.targetX,
    settings.posY - settings.targetY,
    settings.posZ - settings.targetZ
  )
  if (!(current > 1e-6)) return null
  const fit = fitDistanceForObject(object, settings.fov, aspect)
  if (!(fit > 0) || !Number.isFinite(fit)) return null
  return fit / current
}

export function formatViewZoomPercent(factor: number): string {
  const pct = Math.round(factor * 100)
  if (!Number.isFinite(pct)) return '100%'
  return `${pct}%`
}

/** Fit camera to an object bbox — mirrors glb-viewer-core `focus_camera_on_object`. */
export function focusCameraOnObject(
  object: Object3D,
  camera: ViewCamera,
  controls: ControlsLike | null | undefined
) {
  const { center, size, radius } = objectFitMetrics(object)
  const fovDeg = getVirtualFov(camera)
  const aspect = getCameraAspect(camera)
  const fitDistance = fitDistanceFromRadius(radius, fovDeg, aspect)

  const direction = new Vector3()
  camera.getWorldDirection(direction)
  direction.negate()
  camera.position.copy(center.clone().add(direction.multiplyScalar(fitDistance)))
  camera.far = Math.max(camera.far, fitDistance + size.length())
  camera.zoom = 1
  if (camera instanceof OrthographicCamera) {
    syncOrthoFrustum(camera, fovDeg, fitDistance, aspect)
  }
  camera.updateProjectionMatrix()

  if (controls) {
    controls.target.copy(center)
    controls.update()
  }
}

/**
 * Elevation from horizon in degrees (0 = level, positive = look down / higher cam).
 * Maps to Three.js spherical φ via φ = 90° − elevation.
 */
export function readOrbitElevationDegrees(settings: CameraSettings): number {
  const target = new Vector3(settings.targetX, settings.targetY, settings.targetZ)
  const pos = new Vector3(settings.posX, settings.posY, settings.posZ)
  const offset = pos.clone().sub(target)
  if (offset.lengthSq() < 1e-12) return 0
  const spherical = new Spherical().setFromVector3(offset)
  return 90 - MathUtils.radToDeg(spherical.phi)
}

/**
 * Return new CameraSettings with the same target, radius, and azimuth, but
 * orbit elevation set to `elevationDeg` (degrees from horizon).
 */
export function applyOrbitElevationDegrees(
  settings: CameraSettings,
  elevationDeg: number
): CameraSettings {
  const target = new Vector3(settings.targetX, settings.targetY, settings.targetZ)
  const pos = new Vector3(settings.posX, settings.posY, settings.posZ)
  const offset = pos.clone().sub(target)
  const spherical = new Spherical().setFromVector3(offset)
  if (spherical.radius < 1e-6) {
    spherical.radius = 1
  }
  const phi = MathUtils.degToRad(90 - elevationDeg)
  spherical.phi = MathUtils.clamp(phi, PHI_EPS, Math.PI - PHI_EPS)
  offset.setFromSpherical(spherical)
  const next = target.clone().add(offset)
  return {
    ...settings,
    posX: next.x,
    posY: next.y,
    posZ: next.z,
  }
}

/** Apply elevation to a live camera + OrbitControls pair. */
export function setOrbitElevationDegrees(
  camera: ViewCamera,
  controls: ControlsLike | null | undefined,
  elevationDeg: number
) {
  const settings = readCameraSettings(camera, controls)
  const next = applyOrbitElevationDegrees(settings, elevationDeg)
  camera.position.set(next.posX, next.posY, next.posZ)
  if (camera instanceof OrthographicCamera) {
    const target = new Vector3(next.targetX, next.targetY, next.targetZ)
    const distance = Math.max(camera.position.distanceTo(target), 0.001)
    syncOrthoFrustum(camera, getVirtualFov(camera, settings.fov), distance, getCameraAspect(camera))
  }
  camera.updateProjectionMatrix()
  if (controls) {
    controls.target.set(next.targetX, next.targetY, next.targetZ)
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
  camera: ViewCamera,
  viewportHeightPx: number
) {
  let heightAtDistance: number
  if (camera instanceof OrthographicCamera) {
    heightAtDistance = (camera.top - camera.bottom) / Math.max(camera.zoom, 0.001)
  } else {
    const vFov = (getVirtualFov(camera) * Math.PI) / 180
    heightAtDistance = 2 * Math.tan(vFov / 2) * camera.position.distanceTo(targetPos)
  }
  return (desiredScreenPx / Math.max(viewportHeightPx, 1)) * heightAtDistance
}
