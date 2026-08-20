export {
  SMSH_MAGIC,
  SMSH_FORMAT_VERSION,
  SMSH_MODE_ENCRYPTED,
  SMSH_HEADER_FIXED_SIZE,
  SMSH_SALT_SIZE,
  SMSH_NONCE_SIZE,
  SMSH_TAG_SIZE,
  DEFAULT_SCRYPT,
  SmshFormatError,
  encodeHeader,
  decodeHeader,
  isSmshBytes,
  packBundle,
  unpackBundle,
  type SmshHeader,
  type BundleEntry,
  type BundleManifest,
  type PackedBundle,
} from './container'

export {
  DEFAULT_MODEL_PERMISSIONS,
  normalizePermissions,
  serializePermissions,
  parsePermissionsJson,
  isPermissionExpired,
  expiryDateFromDays,
  type ModelPermissions,
} from './permissions'

export {
  MIN_PASSWORD_LENGTH,
  evaluatePasswordStrength,
  type PasswordStrengthLevel,
  type PasswordStrengthResult,
} from './passwordStrength'

export {
  UNAMBIGUOUS_ALPHABET,
  generateGroupedPassword,
  type RandomSource,
} from './generatePassword'

// Crypto (scrypt + AES-GCM) lives in electron/smshCrypto.ts — Node-only, main process.
