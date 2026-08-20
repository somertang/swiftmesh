export const MIN_PASSWORD_LENGTH = 8

export type PasswordStrengthLevel = 'tooShort' | 'weak' | 'medium' | 'strong'

export type PasswordStrengthResult = {
  level: PasswordStrengthLevel
  /** Estimated entropy bits after penalties. */
  entropyBits: number
  /** Hard gate: length >= MIN_PASSWORD_LENGTH and not empty. */
  meetsMinimum: boolean
  /** Optional warning key for UI (blacklist / repetition). */
  warning?: 'common' | 'repetitive' | 'sequential'
}

/** Small built-in common-password denylist (lowercase). */
const COMMON_PASSWORDS = new Set(
  [
    '12345678',
    '123456789',
    '1234567890',
    'password',
    'password1',
    'password12',
    'password123',
    'qwertyui',
    'qwerty123',
    'iloveyou',
    'admin123',
    'welcome1',
    'letmein1',
    'monkey12',
    'dragon12',
    'master12',
    'abc12345',
    '11111111',
    '00000000',
    'asdfghjk',
    'zxcvbnm1',
    'sunshine',
    'princess',
    'football',
    'baseball',
    'superman',
    'trustno1',
    'passw0rd',
    'swiftmesh',
    'swiftmesh1',
  ].map(s => s.toLowerCase())
)

function charsetSize(password: string): number {
  let size = 0
  if (/[a-z]/.test(password)) size += 26
  if (/[A-Z]/.test(password)) size += 26
  if (/[0-9]/.test(password)) size += 10
  if (/[^a-zA-Z0-9]/.test(password)) size += 32
  // Hyphenated generator passwords use a 32-char alphabet
  if (/^[2-9A-HJ-NP-Z-]+$/.test(password) && password.includes('-')) {
    return 32
  }
  return Math.max(size, 1)
}

function hasLongRun(password: string): boolean {
  if (password.length < 3) return false
  let run = 1
  for (let i = 1; i < password.length; i++) {
    if (password[i] === password[i - 1]) {
      run += 1
      if (run >= 3) return true
    } else {
      run = 1
    }
  }
  return false
}

function hasSequentialChars(password: string): boolean {
  const lower = password.toLowerCase()
  for (let i = 0; i < lower.length - 2; i++) {
    const a = lower.charCodeAt(i)
    const b = lower.charCodeAt(i + 1)
    const c = lower.charCodeAt(i + 2)
    if (b === a + 1 && c === a + 2) return true
    if (b === a - 1 && c === a - 2) return true
  }
  return false
}

/**
 * Lightweight strength estimate: charset entropy × length with blacklist /
 * repetition / sequence penalties. Not a substitute for zxcvbn — good enough
 * for casual-threat passphrase UX without a 800KB dictionary.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      level: 'tooShort',
      entropyBits: 0,
      meetsMinimum: false,
    }
  }

  const lower = password.toLowerCase()
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(lower.replace(/-/g, ''))) {
    return {
      level: 'weak',
      entropyBits: 10,
      meetsMinimum: true,
      warning: 'common',
    }
  }

  const size = charsetSize(password)
  let entropy = Math.log2(size) * password.length

  let warning: PasswordStrengthResult['warning']
  if (hasLongRun(password)) {
    entropy *= 0.7
    warning = 'repetitive'
  } else if (hasSequentialChars(password)) {
    entropy *= 0.75
    warning = 'sequential'
  }

  let level: PasswordStrengthLevel
  if (entropy < 40) level = 'weak'
  else if (entropy < 60) level = 'medium'
  else level = 'strong'

  return {
    level,
    entropyBits: Math.round(entropy),
    meetsMinimum: true,
    warning,
  }
}
