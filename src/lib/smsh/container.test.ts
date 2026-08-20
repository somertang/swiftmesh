import { describe, expect, it } from 'vitest'
import {
  encodeHeader,
  decodeHeader,
  isSmshBytes,
  packBundle,
  unpackBundle,
  SMSH_MAGIC,
  SMSH_MODE_ENCRYPTED,
  SMSH_FORMAT_VERSION,
  SmshFormatError,
} from './container'
import {
  DEFAULT_MODEL_PERMISSIONS,
  normalizePermissions,
  parsePermissionsJson,
  serializePermissions,
  isPermissionExpired,
} from './permissions'

describe('permissions', () => {
  it('fills missing fields with defaults', () => {
    expect(normalizePermissions({})).toEqual(DEFAULT_MODEL_PERMISSIONS)
    expect(normalizePermissions({ allowExport: false }).allowExport).toBe(false)
    expect(normalizePermissions({ allowExport: false }).allowRecordVideo).toBe(true)
  })

  it('round-trips through JSON bytes', () => {
    const perms = normalizePermissions({
      allowExport: false,
      allowRecordVideo: false,
      allowRecordImages: true,
      allowInspectAssets: false,
      expiresAt: '2027-01-01',
      watermark: 'CONFIDENTIAL',
    })
    const bytes = serializePermissions(perms)
    expect(parsePermissionsJson(bytes)).toEqual(perms)
  })

  it('detects expired dates', () => {
    expect(isPermissionExpired({ ...DEFAULT_MODEL_PERMISSIONS, expiresAt: null })).toBe(false)
    expect(
      isPermissionExpired(
        { ...DEFAULT_MODEL_PERMISSIONS, expiresAt: '2020-01-01' },
        new Date(2026, 7, 20)
      )
    ).toBe(true)
    expect(
      isPermissionExpired(
        { ...DEFAULT_MODEL_PERMISSIONS, expiresAt: '2099-12-31' },
        new Date(2026, 7, 20)
      )
    ).toBe(false)
  })
})

describe('container header', () => {
  it('round-trips header + permissions', () => {
    const permissionsBytes = serializePermissions({
      ...DEFAULT_MODEL_PERMISSIONS,
      allowExport: false,
    })
    const encoded = encodeHeader({
      formatVersion: SMSH_FORMAT_VERSION,
      mode: SMSH_MODE_ENCRYPTED,
      scryptN: 1 << 15,
      scryptR: 8,
      scryptP: 1,
      salt: new Uint8Array(16).fill(1),
      nonce: new Uint8Array(12).fill(2),
      permissionsBytes,
    })
    const { header, headerByteLength } = decodeHeader(encoded)
    expect(headerByteLength).toBe(encoded.byteLength)
    expect(header.formatVersion).toBe(SMSH_FORMAT_VERSION)
    expect(header.mode).toBe(SMSH_MODE_ENCRYPTED)
    expect(header.scryptN).toBe(1 << 15)
    expect([...header.salt]).toEqual(Array(16).fill(1))
    expect([...header.nonce]).toEqual(Array(12).fill(2))
    expect(parsePermissionsJson(header.permissionsBytes).allowExport).toBe(false)
  })

  it('rejects bad magic', () => {
    const bad = new Uint8Array(60)
    expect(() => decodeHeader(bad)).toThrow(SmshFormatError)
  })

  it('rejects unsupported version', () => {
    const permissionsBytes = serializePermissions(DEFAULT_MODEL_PERMISSIONS)
    const encoded = encodeHeader({
      formatVersion: 99,
      mode: SMSH_MODE_ENCRYPTED,
      scryptN: 1024,
      scryptR: 8,
      scryptP: 1,
      salt: new Uint8Array(16),
      nonce: new Uint8Array(12),
      permissionsBytes,
    })
    expect(() => decodeHeader(encoded)).toThrow(/version/i)
  })

  it('detects smsh magic', () => {
    expect(isSmshBytes(SMSH_MAGIC)).toBe(true)
    expect(isSmshBytes(new Uint8Array([1, 2, 3]))).toBe(false)
  })
})

describe('bundle pack/unpack', () => {
  it('round-trips main + companions including non-ASCII paths', () => {
    const main = new TextEncoder().encode('o Cube\nv 0 0 0\n')
    const mtl = new TextEncoder().encode('newmtl mat\n')
    const tex = new Uint8Array([1, 2, 3, 4])
    const packed = packBundle({
      manifest: {
        format: 'obj',
        mainPath: '椅子.obj',
        entries: [
          { path: '椅子.obj', byteLength: main.byteLength },
          { path: 'mat.mtl', byteLength: mtl.byteLength },
          { path: '贴图/wood.png', byteLength: tex.byteLength },
        ],
      },
      entries: [
        { path: '椅子.obj', data: main },
        { path: 'mat.mtl', data: mtl },
        { path: '贴图/wood.png', data: tex },
      ],
    })
    const unpacked = unpackBundle(packed)
    expect(unpacked.manifest.mainPath).toBe('椅子.obj')
    expect(unpacked.manifest.format).toBe('obj')
    expect(unpacked.entries).toHaveLength(3)
    expect(new TextDecoder().decode(unpacked.entries[0]!.data)).toContain('Cube')
    expect([...unpacked.entries[2]!.data]).toEqual([1, 2, 3, 4])
  })

  it('supports empty companions (glb)', () => {
    const main = new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    const packed = packBundle({
      manifest: {
        format: 'glb',
        mainPath: 'model.glb',
        entries: [{ path: 'model.glb', byteLength: main.byteLength }],
      },
      entries: [{ path: 'model.glb', data: main }],
    })
    const unpacked = unpackBundle(packed)
    expect(unpacked.entries).toHaveLength(1)
    expect(unpacked.manifest.format).toBe('glb')
  })
})
