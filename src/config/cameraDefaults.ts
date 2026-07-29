export type CameraSettings = {
  posX: number
  posY: number
  posZ: number
  targetX: number
  targetY: number
  targetZ: number
  fov: number
}

/** Matches the previous hard-coded ViewerScene camera / OrbitControls. */
export const DEFAULT_CAMERA: CameraSettings = {
  posX: 2.4,
  posY: 1.4,
  posZ: 3.2,
  targetX: 0,
  targetY: 0.55,
  targetZ: 0,
  fov: 35,
}
