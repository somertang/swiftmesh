import {
  BufferAttribute,
  BufferGeometry,
  type BufferAttribute as ThreeBufferAttribute,
} from 'three'
import { targetIndexCount, triangleCountFromIndexCount } from './decimateMath'
import { ensureMeshoptSimplifier } from './meshoptSimplifier'
import { DEFAULT_UV_WEIGHT, solveTargetError } from './solveTargetError'
import type { WeldedSource } from './weldGeometry'

export { DEFAULT_UV_WEIGHT } from './solveTargetError'

/** Legacy default; auto-solve replaces this when ratio < 1. */
export const DEFAULT_TARGET_ERROR = 0.02

export type DecimateGeometryOptions = {
  ratio: number
  /** When set, skips auto error solve and uses this meshopt error cap directly. */
  targetError?: number
  lockBorder?: boolean
}

export type DecimateGeometryResult = {
  geometry: BufferGeometry
  triangleCount: number
  vertexCount: number
  targetTriangleCount: number
  error: number
}

function cloneWeldedGeometry(source: WeldedSource): BufferGeometry {
  return source.geometry.clone()
}

function compactGeometry(
  source: BufferGeometry,
  remappedIndices: Uint32Array,
  remap: Uint32Array,
  uniqueCount: number
): BufferGeometry {
  const out = new BufferGeometry()
  for (const name of Object.keys(source.attributes)) {
    if (name === 'normal' || name === 'tangent') continue
    const attr = source.getAttribute(name)
    const ArrayType = attr.array.constructor as new (length: number) => typeof attr.array
    const dst = new ArrayType(uniqueCount * attr.itemSize)
    const compact = new BufferAttribute(dst, attr.itemSize, attr.normalized)
    for (let i = 0; i < attr.count; i++) {
      const next = remap[i]
      if (next === undefined || next === 0xffffffff) continue
      compact.copyAt(next, attr as ThreeBufferAttribute, i)
    }
    out.setAttribute(name, compact)
  }
  const indexArray =
    uniqueCount > 65535 ? remappedIndices : Uint16Array.from(remappedIndices)
  out.setIndex(new BufferAttribute(indexArray, 1))
  out.computeVertexNormals()
  return out
}

export async function decimateWeldedGeometry(
  source: WeldedSource,
  options: DecimateGeometryOptions
): Promise<DecimateGeometryResult> {
  const lockBorder = options.lockBorder ?? true
  const targetCount = targetIndexCount(source.indices.length, options.ratio)
  const targetTriangleCount = triangleCountFromIndexCount(targetCount)

  if (targetCount >= source.indices.length || source.indices.length < 3) {
    const geometry = cloneWeldedGeometry(source)
    return {
      geometry,
      triangleCount: source.weldedTriangleCount,
      vertexCount: source.weldedVertexCount,
      targetTriangleCount: source.weldedTriangleCount,
      error: 0,
    }
  }

  const simplifier = await ensureMeshoptSimplifier()
  const targetError =
    options.targetError ??
    solveTargetError(simplifier, source, targetCount, lockBorder)

  const flags = lockBorder ? (['LockBorder'] as const) : []
  let simplified: Uint32Array
  let error = 0

  if (source.uvAttributes && source.uvStride > 0) {
    const [dst, err] = simplifier.simplifyWithAttributes(
      source.indices,
      source.positions,
      3,
      source.uvAttributes,
      source.uvStride,
      [DEFAULT_UV_WEIGHT],
      null,
      targetCount,
      targetError,
      [...flags]
    )
    simplified = dst
    error = err
  } else {
    const [dst, err] = simplifier.simplify(
      source.indices,
      source.positions,
      3,
      targetCount,
      targetError,
      [...flags]
    )
    simplified = dst
    error = err
  }

  const compactIndices = new Uint32Array(simplified)
  const [remap, unique] = simplifier.compactMesh(compactIndices)
  const geometry = compactGeometry(source.geometry, compactIndices, remap, unique)

  return {
    geometry,
    triangleCount: triangleCountFromIndexCount(compactIndices.length),
    vertexCount: unique,
    targetTriangleCount,
    error,
  }
}
