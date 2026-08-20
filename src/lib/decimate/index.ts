export {
  achievementRatio,
  clampRatio,
  percentFromRatio,
  ratioFromPercent,
  targetIndexCount,
  triangleCountFromIndexCount,
  triangleCountOf,
} from './decimateMath'
export {
  DEFAULT_MIN_TRIANGLES,
  countSkipReasons,
  decimateSkipReason,
  type DecimateEligibilityInput,
  type DecimateSkipReason,
} from './decimateEligibility'
export {
  DecimateSession,
  EMPTY_DECIMATE_STATS,
  type DecimatePhase,
  type DecimateStats,
} from './decimateSession'
export { exportObjectAsGlb, stripRuntimeUserData } from './exportDecimatedGlb'
