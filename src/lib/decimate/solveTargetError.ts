import type { MeshoptSimplifier } from 'meshoptimizer/simplifier'
import { clampRatio, triangleCountFromIndexCount } from './decimateMath'
import type { WeldedSource } from './weldGeometry'

export const DEFAULT_UV_WEIGHT = 1

/** Lower bound passed to meshoptimizer (essentially “no extra constraint”). */
export const MIN_TARGET_ERROR = 1e-6

/** Upper bound as a fraction of the welded position bbox diagonal. */
export const MAX_ERROR_DIAGONAL_RATIO = 0.05

export const ERROR_SOLVE_ITERATIONS = 10

export type SimplifyAttempt = {
  indexCount: number
  triangleCount: number
  error: number
}

export function positionBBoxDiagonal(positions: Float32Array): number {
  if (positions.length < 3) return 1
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!
    const y = positions[i + 1]!
    const z = positions[i + 2]!
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  const sx = maxX - minX
  const sy = maxY - minY
  const sz = maxZ - minZ
  const diagonal = Math.hypot(sx, sy, sz)
  return diagonal > 0 ? diagonal : 1
}

export function maxSimplificationError(positions: Float32Array): number {
  return Math.max(MIN_TARGET_ERROR, positionBBoxDiagonal(positions) * MAX_ERROR_DIAGONAL_RATIO)
}

/** Rough starting point before binary search (empirical, bbox-relative). */
export function estimateTargetError(positions: Float32Array, ratio: number): number {
  const diagonal = positionBBoxDiagonal(positions)
  const keep = clampRatio(ratio)
  const reduction = 1 - keep
  if (reduction <= 0) return MIN_TARGET_ERROR
  return Math.min(
    maxSimplificationError(positions),
    Math.max(MIN_TARGET_ERROR, diagonal * 0.015 * (reduction / Math.max(keep, 0.05)))
  )
}

export function runSimplifyAttempt(
  simplifier: typeof MeshoptSimplifier,
  source: WeldedSource,
  targetIndexCount: number,
  targetError: number,
  lockBorder: boolean
): SimplifyAttempt {
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
      targetIndexCount,
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
      targetIndexCount,
      targetError,
      [...flags]
    )
    simplified = dst
    error = err
  }

  return {
    indexCount: simplified.length,
    triangleCount: triangleCountFromIndexCount(simplified.length),
    error,
  }
}

/**
 * Find the smallest targetError that yields at most the requested triangle count.
 * meshopt stops early when error is exceeded, so a fixed low error prevents reaching ratio targets.
 */
export function solveTargetError(
  simplifier: typeof MeshoptSimplifier,
  source: WeldedSource,
  targetIndexCount: number,
  lockBorder: boolean
): number {
  const maxError = maxSimplificationError(source.positions)
  const targetTriangles = triangleCountFromIndexCount(targetIndexCount)
  const atMax = runSimplifyAttempt(simplifier, source, targetIndexCount, maxError, lockBorder)
  if (atMax.triangleCount > targetTriangles) {
    return maxError
  }

  let lo = MIN_TARGET_ERROR
  let hi = maxError
  let bestError = maxError
  let bestGap = Math.abs(atMax.triangleCount - targetTriangles)

  for (let i = 0; i < ERROR_SOLVE_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    const attempt = runSimplifyAttempt(simplifier, source, targetIndexCount, mid, lockBorder)
    const gap = Math.abs(attempt.triangleCount - targetTriangles)
    if (gap < bestGap) {
      bestGap = gap
      bestError = mid
    }

    if (attempt.triangleCount > targetTriangles) {
      lo = mid
    } else {
      hi = mid
      bestError = mid
      bestGap = gap
    }

    if (hi - lo <= maxError * 1e-4) break
  }

  return bestError
}
