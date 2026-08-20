/** Characters that look alike when typed by hand — excluded from generated passwords. */
export const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export type RandomSource = (byteLength: number) => Uint8Array

function defaultRandomSource(byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength)
  crypto.getRandomValues(out)
  return out
}

/**
 * Rejection sampling: reject bytes >= floor(256 / alphabetLen) * alphabetLen
 * so every alphabet index is equally likely regardless of alphabet length.
 */
function nextAlphabetIndex(
  alphabetLen: number,
  random: RandomSource
): number {
  const limit = Math.floor(256 / alphabetLen) * alphabetLen
  for (;;) {
    const [byte] = random(1)
    if (byte === undefined) throw new Error('Random source returned empty buffer')
    if (byte < limit) return byte % alphabetLen
  }
}

/**
 * Generate XXXX-XXXX-XXXX-XXXX using the unambiguous 32-char alphabet (80 bits).
 * `random` is injectable for deterministic tests.
 */
export function generateGroupedPassword(
  random: RandomSource = defaultRandomSource,
  alphabet = UNAMBIGUOUS_ALPHABET
): string {
  if (alphabet.length < 2) throw new Error('Alphabet too short')
  const groups: string[] = []
  for (let g = 0; g < 4; g++) {
    let group = ''
    for (let i = 0; i < 4; i++) {
      group += alphabet[nextAlphabetIndex(alphabet.length, random)]!
    }
    groups.push(group)
  }
  return groups.join('-')
}
