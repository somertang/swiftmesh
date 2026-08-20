export type ModelPermissions = {
  /** Allow Reduce mesh → Export GLB. */
  allowExport: boolean
  /** Allow turntable video recording. */
  allowRecordVideo: boolean
  /** Allow image sequence / atlas export. */
  allowRecordImages: boolean
  /** Allow texture previews/downloads and geometry structure inspect. */
  allowInspectAssets: boolean
  /** ISO date string (YYYY-MM-DD) or null. Phase 2. */
  expiresAt: string | null
  /** Watermark text or null. Phase 2. */
  watermark: string | null
}

export const DEFAULT_MODEL_PERMISSIONS: ModelPermissions = {
  allowExport: true,
  allowRecordVideo: true,
  allowRecordImages: true,
  allowInspectAssets: true,
  expiresAt: null,
  watermark: null,
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Normalize unknown JSON into a complete ModelPermissions object. */
export function normalizePermissions(input: unknown): ModelPermissions {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    allowExport: asBoolean(src.allowExport, DEFAULT_MODEL_PERMISSIONS.allowExport),
    allowRecordVideo: asBoolean(src.allowRecordVideo, DEFAULT_MODEL_PERMISSIONS.allowRecordVideo),
    allowRecordImages: asBoolean(src.allowRecordImages, DEFAULT_MODEL_PERMISSIONS.allowRecordImages),
    allowInspectAssets: asBoolean(
      src.allowInspectAssets,
      DEFAULT_MODEL_PERMISSIONS.allowInspectAssets
    ),
    expiresAt: asNullableString(src.expiresAt),
    watermark: asNullableString(src.watermark),
  }
}

export function serializePermissions(permissions: ModelPermissions): Uint8Array {
  const normalized = normalizePermissions(permissions)
  return new TextEncoder().encode(JSON.stringify(normalized))
}

export function parsePermissionsJson(bytes: Uint8Array): ModelPermissions {
  const text = new TextDecoder('utf-8').decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Invalid permissions JSON')
  }
  return normalizePermissions(parsed)
}

/** Returns true when expiresAt is set and is strictly before today's local date. */
export function isPermissionExpired(permissions: ModelPermissions, now = new Date()): boolean {
  if (!permissions.expiresAt) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(permissions.expiresAt)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || !month || !day) return false
  const expiry = new Date(year, month - 1, day, 23, 59, 59, 999)
  return now.getTime() > expiry.getTime()
}

/**
 * Local calendar date `days` after `now`'s local date, as YYYY-MM-DD.
 * Used for encrypt-dialog presets (1 / 3 / 7 / 30 days from encrypt time).
 */
export function expiryDateFromDays(days: number, now = new Date()): string {
  if (!Number.isFinite(days) || days < 0) {
    throw new RangeError('days must be a non-negative finite number')
  }
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  local.setDate(local.getDate() + Math.floor(days))
  const y = local.getFullYear()
  const m = String(local.getMonth() + 1).padStart(2, '0')
  const d = String(local.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
