import type { ModelFormat } from '../../desktopTypes'

export const SMSH_MAGIC = new TextEncoder().encode('SWMSH\0')
export const SMSH_FORMAT_VERSION = 1
export const SMSH_MODE_ENCRYPTED = 1

export const SMSH_HEADER_FIXED_SIZE = 50
export const SMSH_SALT_SIZE = 16
export const SMSH_NONCE_SIZE = 12
export const SMSH_TAG_SIZE = 16

export const DEFAULT_SCRYPT = {
  N: 1 << 17,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
} as const

export type SmshHeader = {
  formatVersion: number
  mode: number
  scryptN: number
  scryptR: number
  scryptP: number
  salt: Uint8Array
  nonce: Uint8Array
  permissionsBytes: Uint8Array
}

export type BundleEntry = {
  path: string
  data: Uint8Array
}

export type BundleManifest = {
  format: ModelFormat
  mainPath: string
  entries: { path: string; byteLength: number }[]
}

export type PackedBundle = {
  manifest: BundleManifest
  entries: BundleEntry[]
}

export class SmshFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmshFormatError'
  }
}

function writeU16LE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function writeU32LE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}

function readU16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function readU32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Encode the fixed header + permissions JSON length prefix + permissions bytes. */
export function encodeHeader(header: SmshHeader): Uint8Array {
  const permissionsLen = header.permissionsBytes.byteLength
  const out = new Uint8Array(SMSH_HEADER_FIXED_SIZE + permissionsLen)
  out.set(SMSH_MAGIC, 0)
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  writeU16LE(view, 6, header.formatVersion)
  out[8] = header.mode & 0xff
  out[9] = 0
  writeU32LE(view, 10, header.scryptN)
  writeU16LE(view, 14, header.scryptR)
  writeU16LE(view, 16, header.scryptP)
  out.set(header.salt, 18)
  out.set(header.nonce, 34)
  writeU32LE(view, 46, permissionsLen)
  out.set(header.permissionsBytes, 50)
  return out
}

/** Parse header + permissions JSON from the start of a .smsh file. */
export function decodeHeader(bytes: Uint8Array): { header: SmshHeader; headerByteLength: number } {
  if (bytes.byteLength < SMSH_HEADER_FIXED_SIZE) {
    throw new SmshFormatError('File too short to be a .smsh container')
  }
  const magic = bytes.subarray(0, 6)
  if (!bytesEqual(magic, SMSH_MAGIC)) {
    throw new SmshFormatError('Not a SwiftMesh encrypted model (bad magic)')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const formatVersion = readU16LE(view, 6)
  if (formatVersion !== SMSH_FORMAT_VERSION) {
    throw new SmshFormatError(`Unsupported .smsh format version ${formatVersion}`)
  }
  const mode = bytes[8]!
  if (mode !== SMSH_MODE_ENCRYPTED) {
    throw new SmshFormatError(`Unsupported .smsh mode ${mode}`)
  }
  const scryptN = readU32LE(view, 10)
  const scryptR = readU16LE(view, 14)
  const scryptP = readU16LE(view, 16)
  const salt = bytes.subarray(18, 34)
  const nonce = bytes.subarray(34, 46)
  const permissionsLen = readU32LE(view, 46)
  if (bytes.byteLength < SMSH_HEADER_FIXED_SIZE + permissionsLen) {
    throw new SmshFormatError('Truncated .smsh permissions block')
  }
  const permissionsBytes = bytes.subarray(50, 50 + permissionsLen)
  return {
    header: {
      formatVersion,
      mode,
      scryptN,
      scryptR,
      scryptP,
      salt: new Uint8Array(salt),
      nonce: new Uint8Array(nonce),
      permissionsBytes: new Uint8Array(permissionsBytes),
    },
    headerByteLength: SMSH_HEADER_FIXED_SIZE + permissionsLen,
  }
}

/** Peek only enough of a file to decide if it is a locked .smsh. */
export function isSmshBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 6) return false
  return bytesEqual(bytes.subarray(0, 6), SMSH_MAGIC)
}

export function packBundle(bundle: PackedBundle): Uint8Array {
  const encoder = new TextEncoder()
  const manifestJson = encoder.encode(JSON.stringify(bundle.manifest))
  let total = 4 + manifestJson.byteLength
  for (const entry of bundle.entries) {
    const pathBytes = encoder.encode(entry.path)
    total += 4 + pathBytes.byteLength + 4 + entry.data.byteLength
  }
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  let offset = 0
  writeU32LE(view, offset, manifestJson.byteLength)
  offset += 4
  out.set(manifestJson, offset)
  offset += manifestJson.byteLength
  for (const entry of bundle.entries) {
    const pathBytes = encoder.encode(entry.path)
    writeU32LE(view, offset, pathBytes.byteLength)
    offset += 4
    out.set(pathBytes, offset)
    offset += pathBytes.byteLength
    writeU32LE(view, offset, entry.data.byteLength)
    offset += 4
    out.set(entry.data, offset)
    offset += entry.data.byteLength
  }
  return out
}

export function unpackBundle(bytes: Uint8Array): PackedBundle {
  if (bytes.byteLength < 4) {
    throw new SmshFormatError('Truncated bundle')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder('utf-8')
  let offset = 0
  const manifestLen = readU32LE(view, offset)
  offset += 4
  if (offset + manifestLen > bytes.byteLength) {
    throw new SmshFormatError('Truncated bundle manifest')
  }
  let manifest: BundleManifest
  try {
    manifest = JSON.parse(decoder.decode(bytes.subarray(offset, offset + manifestLen))) as BundleManifest
  } catch {
    throw new SmshFormatError('Invalid bundle manifest JSON')
  }
  offset += manifestLen
  const entries: BundleEntry[] = []
  while (offset < bytes.byteLength) {
    if (offset + 4 > bytes.byteLength) throw new SmshFormatError('Truncated bundle entry path length')
    const pathLen = readU32LE(view, offset)
    offset += 4
    if (offset + pathLen > bytes.byteLength) throw new SmshFormatError('Truncated bundle entry path')
    const path = decoder.decode(bytes.subarray(offset, offset + pathLen))
    offset += pathLen
    if (offset + 4 > bytes.byteLength) throw new SmshFormatError('Truncated bundle entry data length')
    const dataLen = readU32LE(view, offset)
    offset += 4
    if (offset + dataLen > bytes.byteLength) throw new SmshFormatError('Truncated bundle entry data')
    const data = new Uint8Array(bytes.subarray(offset, offset + dataLen))
    offset += dataLen
    entries.push({ path, data })
  }
  if (!manifest.mainPath || !manifest.format) {
    throw new SmshFormatError('Bundle manifest missing mainPath or format')
  }
  return { manifest, entries }
}
