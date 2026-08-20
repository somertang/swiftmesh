import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIN_TRIANGLES,
  countSkipReasons,
  decimateSkipReason,
} from './decimateEligibility'

describe('decimateSkipReason', () => {
  it('allows a large static mesh', () => {
    expect(
      decimateSkipReason({ isSkinned: false, hasMorphTargets: false, triangleCount: 10_000 })
    ).toBeNull()
  })
  it('skips skinned meshes first', () => {
    expect(
      decimateSkipReason({ isSkinned: true, hasMorphTargets: true, triangleCount: 10 })
    ).toBe('skinned')
  })
  it('skips morph-target meshes', () => {
    expect(
      decimateSkipReason({ isSkinned: false, hasMorphTargets: true, triangleCount: 10_000 })
    ).toBe('morph')
  })
  it('skips meshes below the triangle floor', () => {
    expect(
      decimateSkipReason({
        isSkinned: false,
        hasMorphTargets: false,
        triangleCount: DEFAULT_MIN_TRIANGLES - 1,
      })
    ).toBe('too-small')
  })
  it('keeps meshes exactly at the floor', () => {
    expect(
      decimateSkipReason({
        isSkinned: false,
        hasMorphTargets: false,
        triangleCount: DEFAULT_MIN_TRIANGLES,
      })
    ).toBeNull()
  })
})

describe('countSkipReasons', () => {
  it('tallies skip reasons and eligible meshes', () => {
    expect(
      countSkipReasons(['skinned', null, 'morph', 'too-small', null, 'skinned'])
    ).toEqual({
      skippedSkinned: 2,
      skippedMorph: 1,
      skippedSmall: 1,
      eligibleCount: 2,
    })
  })
})
