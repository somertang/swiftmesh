import { Box3, Object3D, Vector3 } from 'three'

/** Target max edge (meters) when upscaling tiny authored models. */
const TINY_TARGET_MAX = 2

/**
 * Heuristic unit scale for display clones.
 * Treats glTF/Three world units as meters; corrects common cm/mm authorship.
 */
export function computeUnitScaleFactor(maxDim: number): number {
  if (!Number.isFinite(maxDim) || maxDim <= 0) return 1
  if (maxDim <= 0.05) return TINY_TARGET_MAX / maxDim
  if (maxDim <= 50) return 1
  if (maxDim <= 5000) return 0.01
  return 0.001
}

/** Compact multiplier for HUD readout, e.g. ×1, ×0.01, ×66.7. */
export function formatUnitScaleFactor(factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return '×1'
  if (Math.abs(factor - 1) < 1e-6) return '×1'
  return `×${parseFloat(factor.toPrecision(3))}`
}

export function measureObjectSize(root: Object3D): { x: number; y: number; z: number; maxDim: number } {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  if (box.isEmpty()) return { x: 0, y: 0, z: 0, maxDim: 0 }
  const size = box.getSize(new Vector3())
  return {
    x: size.x,
    y: size.y,
    z: size.z,
    maxDim: Math.max(size.x, size.y, size.z),
  }
}

export type SceneHelperExtents = {
  gridSize: number
  gridDivisions: number
  axesLength: number
  groundSize: number
  shadowSize: number
  fogNear: number
  fogFar: number
}

const DEFAULT_HELPERS: SceneHelperExtents = {
  gridSize: 10,
  gridDivisions: 10,
  axesLength: 1,
  groundSize: 100,
  shadowSize: 2.4,
  fogNear: 10,
  fogFar: 80,
}

/** Size floor/grid/axes/fog relative to the display-model bounding box. */
export function computeSceneHelperExtents(
  size: { x: number; y: number; z: number; maxDim: number } | null
): SceneHelperExtents {
  if (!size || !(size.maxDim > 0)) return { ...DEFAULT_HELPERS }

  const { maxDim } = size
  const footprint = Math.max(size.x, size.z, 0.5)
  const gridSize = Math.max(10, Math.ceil(maxDim * 2))
  // Keep ~1-unit cells for small scenes; cap divisions for large models.
  const gridDivisions = Math.min(40, Math.max(10, Math.round(gridSize)))

  return {
    gridSize,
    gridDivisions,
    axesLength: Math.max(1, maxDim * 0.15),
    groundSize: Math.max(100, maxDim * 20),
    shadowSize: Math.max(2.4, footprint * 1.2),
    fogNear: Math.max(10, maxDim * 2),
    fogFar: Math.max(80, maxDim * 16),
  }
}
