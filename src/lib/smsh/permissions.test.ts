import { describe, expect, it } from 'vitest'
import { expiryDateFromDays, isPermissionExpired, DEFAULT_MODEL_PERMISSIONS } from './permissions'

describe('expiryDateFromDays', () => {
  it('adds whole local calendar days from encrypt-time local date', () => {
    // Mid-day to prove we use the calendar date, not UTC midnight edge cases alone.
    const now = new Date(2026, 7, 20, 15, 30, 0) // 2026-08-20 local
    expect(expiryDateFromDays(1, now)).toBe('2026-08-21')
    expect(expiryDateFromDays(3, now)).toBe('2026-08-23')
    expect(expiryDateFromDays(7, now)).toBe('2026-08-27')
    expect(expiryDateFromDays(30, now)).toBe('2026-09-19')
  })

  it('rolls across month boundaries', () => {
    const now = new Date(2026, 0, 31, 10, 0, 0) // 2026-01-31
    expect(expiryDateFromDays(1, now)).toBe('2026-02-01')
  })

  it('rejects negative days', () => {
    expect(() => expiryDateFromDays(-1)).toThrow(RangeError)
  })
})

describe('isPermissionExpired with preset dates', () => {
  it('allows the expiry calendar day itself', () => {
    const permissions = { ...DEFAULT_MODEL_PERMISSIONS, expiresAt: '2026-08-21' }
    expect(isPermissionExpired(permissions, new Date(2026, 7, 21, 12, 0, 0))).toBe(false)
    expect(isPermissionExpired(permissions, new Date(2026, 7, 22, 0, 0, 1))).toBe(true)
  })
})
