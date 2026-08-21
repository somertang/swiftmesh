const loadedFamilies = new Map<string, FontFace>()

function familyNameFromFile(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').trim() || 'CustomFont'
  // CSS font-family identifiers: keep alphanumerics + underscore.
  const safe = stem.replace(/[^a-zA-Z0-9_-]+/g, '_')
  return `wm_${safe}_${Math.random().toString(36).slice(2, 8)}`
}

/** Load a user .ttf/.otf via FontFace and register it for canvas text. */
export async function loadUserFont(file: File): Promise<string> {
  const family = familyNameFromFile(file.name)
  const buffer = await file.arrayBuffer()
  const face = new FontFace(family, buffer)
  await face.load()
  document.fonts.add(face)
  loadedFamilies.set(family, face)
  return family
}

export function unloadUserFont(family: string) {
  const face = loadedFamilies.get(family)
  if (!face) return
  document.fonts.delete(face)
  loadedFamilies.delete(family)
}
