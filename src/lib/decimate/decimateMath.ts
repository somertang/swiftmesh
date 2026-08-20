/** Clamp ratio to [0, 1]. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 1
  return Math.min(1, Math.max(0, ratio))
}

/**
 * Convert a keep-ratio into a triangle-index target (multiple of 3).
 * A ratio of 1 keeps every triangle; 0 still retains one triangle when possible.
 */
export function targetIndexCount(indexCount: number, ratio: number): number {
  if (!Number.isFinite(indexCount) || indexCount < 3) {
    return Math.max(0, Math.floor(indexCount / 3) * 3)
  }
  const triangles = Math.floor(indexCount / 3)
  const keep = clampRatio(ratio)
  const targetTris = Math.max(1, Math.floor(triangles * keep))
  return Math.min(triangles, targetTris) * 3
}

export function triangleCountFromIndexCount(indexCount: number): number {
  if (!Number.isFinite(indexCount) || indexCount < 3) return 0
  return Math.floor(indexCount / 3)
}

export function triangleCountOf(indexCount: number | null, positionCount: number): number {
  if (indexCount != null) return triangleCountFromIndexCount(indexCount)
  return triangleCountFromIndexCount(positionCount)
}

/** actual / original, 1 when original is empty. */
export function achievementRatio(actual: number, original: number): number {
  if (!Number.isFinite(actual) || !Number.isFinite(original) || original <= 0) return 1
  return actual / original
}

export function percentFromRatio(ratio: number): number {
  return Math.round(clampRatio(ratio) * 100)
}

export function ratioFromPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 1
  return clampRatio(percent / 100)
}
