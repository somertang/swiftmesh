export const DEFAULT_MIN_TRIANGLES = 300

export type DecimateSkipReason = 'skinned' | 'morph' | 'too-small'

export type DecimateEligibilityInput = {
  isSkinned: boolean
  hasMorphTargets: boolean
  triangleCount: number
}

export function decimateSkipReason(
  input: DecimateEligibilityInput,
  minTriangles = DEFAULT_MIN_TRIANGLES
): DecimateSkipReason | null {
  if (input.isSkinned) return 'skinned'
  if (input.hasMorphTargets) return 'morph'
  if (input.triangleCount < minTriangles) return 'too-small'
  return null
}

export function countSkipReasons(reasons: Array<DecimateSkipReason | null>): {
  skippedSkinned: number
  skippedMorph: number
  skippedSmall: number
  eligibleCount: number
} {
  let skippedSkinned = 0
  let skippedMorph = 0
  let skippedSmall = 0
  let eligibleCount = 0
  for (const reason of reasons) {
    if (reason === 'skinned') skippedSkinned += 1
    else if (reason === 'morph') skippedMorph += 1
    else if (reason === 'too-small') skippedSmall += 1
    else eligibleCount += 1
  }
  return { skippedSkinned, skippedMorph, skippedSmall, eligibleCount }
}
