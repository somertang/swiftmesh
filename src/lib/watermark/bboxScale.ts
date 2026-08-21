import { Box3, type BufferGeometry, type Object3D, Vector3 } from 'three'

const _box = new Box3()
const _size = new Vector3()

/** Max axis length of an object’s world-space AABB (minimum 1e-6). */
export function computeObjectMaxDim(root: Object3D): number {
  root.updateMatrixWorld(true)
  _box.setFromObject(root)
  if (_box.isEmpty()) return 1
  _box.getSize(_size)
  return Math.max(_size.x, _size.y, _size.z, 1e-6)
}

/** Max axis length from local geometry bounds (bake uses object-space positions). */
export function computeGeometryMaxDim(geometry: BufferGeometry): number {
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box || box.isEmpty()) return 1
  box.getSize(_size)
  return Math.max(_size.x, _size.y, _size.z, 1e-6)
}

export function invSizeFromMaxDim(maxDim: number): number {
  return 1 / Math.max(maxDim, 1e-6)
}
