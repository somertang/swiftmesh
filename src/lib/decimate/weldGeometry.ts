import {
  BufferGeometry,
  Float32BufferAttribute,
  type BufferAttribute,
  type InterleavedBufferAttribute,
} from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { triangleCountOf } from './decimateMath'

export const WELD_TOLERANCE = 1e-4
const WELD_BATCH = 6

export type WeldedSource = {
  geometry: BufferGeometry
  positions: Float32Array
  indices: Uint32Array
  uvAttributes: Float32Array | null
  uvStride: number
  originalVertexCount: number
  originalTriangleCount: number
  weldedVertexCount: number
  weldedTriangleCount: number
}

export type WeldProgress = {
  done: number
  total: number
}

function positionCount(geometry: BufferGeometry): number {
  return geometry.getAttribute('position')?.count ?? 0
}

function indexCount(geometry: BufferGeometry): number | null {
  const index = geometry.getIndex()
  return index ? index.count : null
}

function copyFloat32Attribute(
  attr: BufferAttribute | InterleavedBufferAttribute,
  itemSize: number
): Float32Array {
  const out = new Float32Array(attr.count * itemSize)
  for (let i = 0; i < attr.count; i++) {
    out[i * itemSize] = attr.getX(i)
    if (itemSize > 1) out[i * itemSize + 1] = attr.getY(i)
    if (itemSize > 2) out[i * itemSize + 2] = attr.getZ(i)
    if (itemSize > 3) out[i * itemSize + 3] = attr.getW(i)
  }
  return out
}

export function extractPositions(geometry: BufferGeometry): Float32Array {
  const attr = geometry.getAttribute('position')
  if (!attr) return new Float32Array()
  if (
    !('isInterleavedBufferAttribute' in attr && attr.isInterleavedBufferAttribute) &&
    attr.array instanceof Float32Array &&
    attr.itemSize === 3
  ) {
    return attr.array
  }
  return copyFloat32Attribute(attr, 3)
}

export function extractIndices(geometry: BufferGeometry): Uint32Array {
  const index = geometry.getIndex()
  if (index) {
    return index.array instanceof Uint32Array
      ? new Uint32Array(index.array)
      : new Uint32Array(index.array)
  }
  const count = positionCount(geometry)
  const indices = new Uint32Array(count)
  for (let i = 0; i < count; i++) indices[i] = i
  return indices
}

export function extractUvs(geometry: BufferGeometry): { data: Float32Array; stride: number } | null {
  const uv = geometry.getAttribute('uv')
  if (!uv || uv.itemSize < 2) return null
  return { data: copyFloat32Attribute(uv, 2), stride: 2 }
}

/** Clone, drop authored normals, weld coincident vertices, then rebuild normals. */
export function weldGeometry(source: BufferGeometry, tolerance = WELD_TOLERANCE): WeldedSource {
  const originalVertexCount = positionCount(source)
  const originalTriangleCount = triangleCountOf(indexCount(source), originalVertexCount)

  const scratch = source.clone()
  scratch.deleteAttribute('normal')
  scratch.deleteAttribute('tangent')

  const welded = BufferGeometryUtils.mergeVertices(scratch, tolerance)
  if (welded !== scratch) scratch.dispose()
  welded.computeVertexNormals()

  const positions = extractPositions(welded)
  const indices = extractIndices(welded)
  const uvs = extractUvs(welded)

  return {
    geometry: welded,
    positions,
    indices,
    uvAttributes: uvs?.data ?? null,
    uvStride: uvs?.stride ?? 0,
    originalVertexCount,
    originalTriangleCount,
    weldedVertexCount: positionCount(welded),
    weldedTriangleCount: triangleCountOf(indices.length, positionCount(welded)),
  }
}

export async function weldGeometryBatch(
  geometries: BufferGeometry[],
  onProgress?: (progress: WeldProgress) => void,
  tolerance = WELD_TOLERANCE
): Promise<WeldedSource[]> {
  const results: WeldedSource[] = []
  const total = geometries.length
  onProgress?.({ done: 0, total })
  for (let i = 0; i < geometries.length; i++) {
    results.push(weldGeometry(geometries[i]!, tolerance))
    onProgress?.({ done: i + 1, total })
    if ((i + 1) % WELD_BATCH === 0) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0)
      })
    }
  }
  return results
}

export function disposeWeldedSource(source: WeldedSource) {
  source.geometry.dispose()
}

/** Packed positions for a two-triangle quad (triangle soup, 6 vertices). */
export function createTriangleSoupQuad(): BufferGeometry {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
  ])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}
