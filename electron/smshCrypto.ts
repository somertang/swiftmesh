import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import {
  DEFAULT_SCRYPT,
  SMSH_MODE_ENCRYPTED,
  SMSH_FORMAT_VERSION,
  SMSH_NONCE_SIZE,
  SMSH_SALT_SIZE,
  SMSH_TAG_SIZE,
  SmshFormatError,
  decodeHeader,
  encodeHeader,
  type SmshHeader,
} from '../src/lib/smsh/container'
import {
  normalizePermissions,
  parsePermissionsJson,
  serializePermissions,
  type ModelPermissions,
} from '../src/lib/smsh/permissions'

const scryptAsync = promisify(scryptCallback)

export type EncryptSmshInput = {
  plaintext: Uint8Array
  password: string
  permissions: ModelPermissions
  /** Override scrypt params (tests may use a smaller N). */
  scrypt?: { N: number; r: number; p: number; maxmem: number }
}

export type DecryptSmshResult = {
  plaintext: Uint8Array
  permissions: ModelPermissions
  header: SmshHeader
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  params: { N: number; r: number; p: number; maxmem: number }
): Promise<Buffer> {
  // Node's default maxmem is 32MB; N=2^17 needs ~134MB.
  return scryptAsync(password, Buffer.from(salt), 32, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: params.maxmem,
  }) as Promise<Buffer>
}

/** Encrypt plaintext bytes into a complete .smsh file buffer. */
export async function encryptSmsh(input: EncryptSmshInput): Promise<Uint8Array> {
  const scrypt = input.scrypt ?? DEFAULT_SCRYPT
  const permissions = normalizePermissions(input.permissions)
  const permissionsBytes = serializePermissions(permissions)
  const salt = randomBytes(SMSH_SALT_SIZE)
  const nonce = randomBytes(SMSH_NONCE_SIZE)
  const key = await deriveKey(input.password, salt, scrypt)

  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(permissionsBytes))
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(input.plaintext)),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  const header = encodeHeader({
    formatVersion: SMSH_FORMAT_VERSION,
    mode: SMSH_MODE_ENCRYPTED,
    scryptN: scrypt.N,
    scryptR: scrypt.r,
    scryptP: scrypt.p,
    salt,
    nonce,
    permissionsBytes,
  })

  const out = new Uint8Array(header.byteLength + encrypted.byteLength + SMSH_TAG_SIZE)
  out.set(header, 0)
  out.set(encrypted, header.byteLength)
  out.set(tag, header.byteLength + encrypted.byteLength)
  return out
}

/** Decrypt a complete .smsh file buffer. Throws on bad password / tampering. */
export async function decryptSmsh(fileBytes: Uint8Array, password: string): Promise<DecryptSmshResult> {
  const { header, headerByteLength } = decodeHeader(fileBytes)
  if (fileBytes.byteLength < headerByteLength + SMSH_TAG_SIZE) {
    throw new SmshFormatError('Truncated .smsh ciphertext')
  }
  const permissions = parsePermissionsJson(header.permissionsBytes)
  const ciphertext = fileBytes.subarray(headerByteLength, fileBytes.byteLength - SMSH_TAG_SIZE)
  const tag = fileBytes.subarray(fileBytes.byteLength - SMSH_TAG_SIZE)

  const key = await deriveKey(password, header.salt, {
    N: header.scryptN,
    r: header.scryptR,
    p: header.scryptP,
    maxmem: Math.max(DEFAULT_SCRYPT.maxmem, 128 * header.scryptN * header.scryptR),
  })

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, header.nonce)
    decipher.setAAD(Buffer.from(header.permissionsBytes))
    decipher.setAuthTag(Buffer.from(tag))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext)),
      decipher.final(),
    ])
    return {
      plaintext: new Uint8Array(plaintext),
      permissions,
      header,
    }
  } catch {
    throw new SmshFormatError('Incorrect password or tampered file')
  }
}
