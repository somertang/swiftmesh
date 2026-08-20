import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, evaluatePasswordStrength } from './passwordStrength'
import { generateGroupedPassword, UNAMBIGUOUS_ALPHABET } from './generatePassword'

describe('evaluatePasswordStrength', () => {
  it('rejects passwords shorter than the minimum', () => {
    const result = evaluatePasswordStrength('short')
    expect(result.meetsMinimum).toBe(false)
    expect(result.level).toBe('tooShort')
  })

  it('flags common passwords as weak even when long enough', () => {
    const result = evaluatePasswordStrength('password1')
    expect(result.meetsMinimum).toBe(true)
    expect(result.level).toBe('weak')
    expect(result.warning).toBe('common')
  })

  it('penalizes repetitive runs', () => {
    const result = evaluatePasswordStrength('aaaaaaaa')
    expect(result.meetsMinimum).toBe(true)
    expect(result.warning).toBe('repetitive')
    expect(result.level).toBe('weak')
  })

  it('rates generated-style passwords as strong', () => {
    const result = evaluatePasswordStrength('7K9M-P2XR-4TVH-8NQW')
    expect(result.meetsMinimum).toBe(true)
    expect(result.level).toBe('strong')
    expect(result.entropyBits).toBeGreaterThanOrEqual(60)
  })

  it('exposes MIN_PASSWORD_LENGTH', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })
})

describe('generateGroupedPassword', () => {
  it('produces XXXX-XXXX-XXXX-XXXX from the unambiguous alphabet', () => {
    let cursor = 0
    const sequence = new Uint8Array(64)
    for (let i = 0; i < sequence.length; i++) sequence[i] = i
    const random = (n: number) => {
      const slice = sequence.subarray(cursor, cursor + n)
      cursor += n
      return new Uint8Array(slice)
    }
    const password = generateGroupedPassword(random)
    expect(password).toMatch(/^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){3}$/)
    for (const ch of password.replace(/-/g, '')) {
      expect(UNAMBIGUOUS_ALPHABET.includes(ch)).toBe(true)
    }
  })

  it('is deterministic given a fixed random source', () => {
    const make = () => {
      let i = 0
      return (n: number) => {
        const out = new Uint8Array(n)
        for (let j = 0; j < n; j++) out[j] = (i++ * 17) & 0xff
        return out
      }
    }
    expect(generateGroupedPassword(make())).toBe(generateGroupedPassword(make()))
  })

  it('never emits ambiguous characters', () => {
    const ambiguous = new Set(['0', 'O', 'o', '1', 'l', 'I', 'i'])
    let counter = 0
    const random = (n: number) => {
      const out = new Uint8Array(n)
      for (let i = 0; i < n; i++) out[i] = (counter++ * 31) & 0xff
      return out
    }
    for (let round = 0; round < 20; round++) {
      const password = generateGroupedPassword(random)
      for (const ch of password.replace(/-/g, '')) {
        expect(ambiguous.has(ch)).toBe(false)
      }
    }
  })
})
