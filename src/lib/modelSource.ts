export type ModelFormat = 'glb' | 'gltf' | 'obj'

export type ModelSource = {
  format: ModelFormat
  mainUrl: string
  label: string
  path: string | null
  /** Relative path / basename → blob URL for sidecar assets. */
  resourceUrls: Record<string, string>
}

export const MODEL_FILE_ACCEPT = '.glb,.gltf,.obj,model/gltf-binary,model/gltf+json'

export function detectModelFormat(fileName: string): ModelFormat | null {
  if (/\.glb$/i.test(fileName)) return 'glb'
  if (/\.gltf$/i.test(fileName)) return 'gltf'
  if (/\.obj$/i.test(fileName)) return 'obj'
  return null
}

export function isModelFileName(fileName: string): boolean {
  return detectModelFormat(fileName) !== null
}

export function basenameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

export function stemFromName(name: string): string {
  const base = basenameOf(name)
  return base.replace(/\.[^.]+$/, '') || 'model'
}

/** Normalize path separators and strip leading ./ */
export function normalizeAssetPath(uri: string): string {
  return uri.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function isDataOrAbsoluteUri(uri: string): boolean {
  return /^(data:|https?:|blob:|file:)/i.test(uri)
}

/** Collect relative URIs referenced by a .gltf JSON document. */
export function collectGltfSidecarUris(gltfJson: unknown): string[] {
  if (!gltfJson || typeof gltfJson !== 'object') return []
  const root = gltfJson as Record<string, unknown>
  const uris: string[] = []

  const pushUri = (uri: unknown) => {
    if (typeof uri !== 'string' || !uri || isDataOrAbsoluteUri(uri)) return
    uris.push(normalizeAssetPath(uri))
  }

  for (const key of ['buffers', 'images'] as const) {
    const list = root[key]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (item && typeof item === 'object' && 'uri' in item) {
        pushUri((item as { uri?: unknown }).uri)
      }
    }
  }

  return [...new Set(uris)]
}

/** Collect mtllib names from OBJ text. */
export function collectObjMtllibs(objText: string): string[] {
  const names: string[] = []
  for (const line of objText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.toLowerCase().startsWith('mtllib ')) continue
    const rest = trimmed.slice(6).trim()
    if (!rest) continue
    for (const part of rest.split(/\s+/)) {
      if (part && !isDataOrAbsoluteUri(part)) names.push(normalizeAssetPath(part))
    }
  }
  return [...new Set(names)]
}

/** Collect texture / map paths from MTL text. */
export function collectMtlTextureUris(mtlText: string): string[] {
  const uris: string[] = []
  const mapKeys =
    /^(map_Kd|map_Ka|map_Ks|map_Ns|map_d|map_bump|bump|disp|decal|norm|map_Kn|map_Pr|map_Pm|map_Ps|map_Ke)\b/i
  for (const line of mtlText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!mapKeys.test(trimmed)) continue
    const tokens = trimmed.split(/\s+/).slice(1)
    // Skip option flags like -bm 1.0; last non-option token is usually the path.
    let pathToken: string | null = null
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!
      if (t.startsWith('-')) {
        i += 1
        continue
      }
      pathToken = t
    }
    if (pathToken && !isDataOrAbsoluteUri(pathToken)) {
      uris.push(normalizeAssetPath(pathToken))
    }
  }
  return [...new Set(uris)]
}

export function mimeForFormat(format: ModelFormat): string {
  switch (format) {
    case 'glb':
      return 'model/gltf-binary'
    case 'gltf':
      return 'model/gltf+json'
    case 'obj':
      return 'text/plain'
  }
}

export function revokeModelSource(source: ModelSource | null | undefined) {
  if (!source) return
  const urls = new Set<string>([source.mainUrl, ...Object.values(source.resourceUrls)])
  for (const url of urls) {
    URL.revokeObjectURL(url)
  }
}

/**
 * Resolve a loader-relative URL against known sidecar blob URLs.
 * Tries full normalized path, then basename.
 */
export function resolveResourceUrl(
  requestedUrl: string,
  resourceUrls: Record<string, string>
): string | null {
  const normalized = normalizeAssetPath(requestedUrl)
  if (resourceUrls[normalized]) return resourceUrls[normalized]
  const base = basenameOf(normalized)
  if (resourceUrls[base]) return resourceUrls[base]
  // Also try matching by basename of stored keys
  for (const [key, url] of Object.entries(resourceUrls)) {
    if (basenameOf(key) === base) return url
  }
  return null
}

export function attachResourceUrlModifier(
  manager: { setURLModifier: (fn: (url: string) => string) => void },
  resourceUrls: Record<string, string>
) {
  if (Object.keys(resourceUrls).length === 0) return
  manager.setURLModifier(url => {
    if (isDataOrAbsoluteUri(url) && !url.startsWith('blob:')) return url
    // Strip query/hash if present
    const clean = url.split(/[?#]/)[0] ?? url
    const resolved = resolveResourceUrl(clean, resourceUrls)
    return resolved ?? url
  })
}
