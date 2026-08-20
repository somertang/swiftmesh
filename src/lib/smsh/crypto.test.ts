import { describe, expect, it } from 'vitest'
import { encryptSmsh, decryptSmsh } from '../../../electron/smshCrypto'
import { packBundle, unpackBundle, SmshFormatError } from './container'
import { DEFAULT_MODEL_PERMISSIONS } from './permissions'

/** Fast scrypt params for unit tests only. */
const TEST_SCRYPT = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

describe('encryptSmsh / decryptSmsh', () => {
  it('round-trips plaintext with permissions as AAD', async () => {
    const plaintext = packBundle({
      manifest: {
        format: 'glb',
        mainPath: 'a.glb',
        entries: [{ path: 'a.glb', byteLength: 4 }],
      },
      entries: [{ path: 'a.glb', data: new Uint8Array([1, 2, 3, 4]) }],
    })
    const permissions = {
      ...DEFAULT_MODEL_PERMISSIONS,
      allowExport: false,
      watermark: 'TEST',
    }
    const file = await encryptSmsh({
      plaintext,
      password: '7K9M-P2XR-4TVH-8NQW',
      permissions,
      scrypt: TEST_SCRYPT,
    })
    const result = await decryptSmsh(file, '7K9M-P2XR-4TVH-8NQW')
    expect(result.permissions.allowExport).toBe(false)
    expect(result.permissions.watermark).toBe('TEST')
    const unpacked = unpackBundle(result.plaintext)
    expect([...unpacked.entries[0]!.data]).toEqual([1, 2, 3, 4])
  })

  it('rejects wrong password', async () => {
    const file = await encryptSmsh({
      plaintext: new Uint8Array([9, 9, 9]),
      password: 'correct-horse-battery',
      permissions: DEFAULT_MODEL_PERMISSIONS,
      scrypt: TEST_SCRYPT,
    })
    await expect(decryptSmsh(file, 'wrong-password')).rejects.toThrow(SmshFormatError)
  })

  it('rejects tampered permissions bytes', async () => {
    const file = await encryptSmsh({
      plaintext: new Uint8Array([1]),
      password: 'abcdefgh',
      permissions: DEFAULT_MODEL_PERMISSIONS,
      scrypt: TEST_SCRYPT,
    })
    const tampered = new Uint8Array(file)
    tampered[55] = tampered[55]! ^ 0xff
    await expect(decryptSmsh(tampered, 'abcdefgh')).rejects.toThrow(SmshFormatError)
  })

  it('rejects tampered ciphertext', async () => {
    const file = await encryptSmsh({
      plaintext: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      password: 'abcdefgh',
      permissions: DEFAULT_MODEL_PERMISSIONS,
      scrypt: TEST_SCRYPT,
    })
    const tampered = new Uint8Array(file)
    tampered[tampered.byteLength - 20] = tampered[tampered.byteLength - 20]! ^ 0xff
    await expect(decryptSmsh(tampered, 'abcdefgh')).rejects.toThrow(SmshFormatError)
  })
})
