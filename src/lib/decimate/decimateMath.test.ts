import { describe, expect, it } from 'vitest'
import {
  achievementRatio,
  clampRatio,
  percentFromRatio,
  ratioFromPercent,
  targetIndexCount,
  triangleCountFromIndexCount,
  triangleCountOf,
} from './decimateMath'

describe('clampRatio', () => {
  it('keeps values in 0–1', () => {
    expect(clampRatio(0.3)).toBe(0.3)
  })
  it('clamps above 1 and below 0', () => {
    expect(clampRatio(1.4)).toBe(1)
    expect(clampRatio(-0.2)).toBe(0)
  })
  it('treats non-finite as 1', () => {
    expect(clampRatio(Number.NaN)).toBe(1)
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('targetIndexCount', () => {
  it('returns a multiple of 3 at 50%', () => {
    expect(targetIndexCount(99, 0.5)).toBe(48)
  })
  it('keeps all triangles at ratio 1', () => {
    expect(targetIndexCount(99, 1)).toBe(99)
  })
  it('keeps at least one triangle when ratio is 0', () => {
    expect(targetIndexCount(99, 0)).toBe(3)
  })
  it('returns 0 when there are fewer than 3 indices', () => {
    expect(targetIndexCount(2, 0.5)).toBe(0)
    expect(targetIndexCount(0, 1)).toBe(0)
  })
})

describe('triangle counts', () => {
  it('floors index count by 3', () => {
    expect(triangleCountFromIndexCount(10)).toBe(3)
    expect(triangleCountFromIndexCount(2)).toBe(0)
  })
  it('uses positions when unindexed', () => {
    expect(triangleCountOf(null, 9)).toBe(3)
    expect(triangleCountOf(12, 99)).toBe(4)
  })
})

describe('achievementRatio', () => {
  it('divides actual by original', () => {
    expect(achievementRatio(25, 100)).toBe(0.25)
  })
  it('returns 1 when original is empty', () => {
    expect(achievementRatio(0, 0)).toBe(1)
  })
})

describe('percent conversion', () => {
  it('rounds ratio to percent', () => {
    expect(percentFromRatio(0.334)).toBe(33)
  })
  it('converts percent back to ratio', () => {
    expect(ratioFromPercent(30)).toBe(0.3)
    expect(ratioFromPercent(150)).toBe(1)
  })
})
