import { describe, expect, it } from 'vitest'
import {
  estimateTargetError,
  maxSimplificationError,
  positionBBoxDiagonal,
} from './solveTargetError'

describe('positionBBoxDiagonal', () => {
  it('returns the corner-to-corner length of the position bounds', () => {
    const positions = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0])
    expect(positionBBoxDiagonal(positions)).toBeCloseTo(Math.hypot(2, 2, 0), 5)
  })

  it('falls back to 1 for empty input', () => {
    expect(positionBBoxDiagonal(new Float32Array())).toBe(1)
  })
})

describe('maxSimplificationError', () => {
  it('scales with bbox diagonal', () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0])
    expect(maxSimplificationError(positions)).toBeCloseTo(0.5, 5)
  })
})

describe('estimateTargetError', () => {
  it('increases as keep ratio decreases', () => {
    const positions = new Float32Array([0, 0, 0, 100, 100, 100])
    const high = estimateTargetError(positions, 0.9)
    const low = estimateTargetError(positions, 0.5)
    expect(low).toBeGreaterThan(high)
  })
})
