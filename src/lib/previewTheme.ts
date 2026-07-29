export type PreviewTheme = 'simple' | 'professional'

export const PREVIEW_THEME_STORAGE_KEY = 'swiftmesh.previewTheme'
export const DEFAULT_PREVIEW_THEME: PreviewTheme = 'simple'

export function isPreviewTheme(value: unknown): value is PreviewTheme {
  return value === 'simple' || value === 'professional'
}

export function readStoredPreviewTheme(): PreviewTheme {
  try {
    const raw = localStorage.getItem(PREVIEW_THEME_STORAGE_KEY)
    if (isPreviewTheme(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_PREVIEW_THEME
}

export function writeStoredPreviewTheme(theme: PreviewTheme) {
  try {
    localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/** Simple (product) preview: light grey studio. */
export const SIMPLE_SCENE_BG = 0xa0a0a0
export const SIMPLE_SCENE_BG_CSS = '#a0a0a0'

/** Professional (glb-viewer-core style) preview: dark viewport. */
export const PROFESSIONAL_SCENE_BG = 0x3f3f3f
export const PROFESSIONAL_SCENE_BG_CSS = '#3f3f3f'

export function sceneBgForTheme(theme: PreviewTheme): number {
  return theme === 'professional' ? PROFESSIONAL_SCENE_BG : SIMPLE_SCENE_BG
}

export function sceneBgCssForTheme(theme: PreviewTheme): string {
  return theme === 'professional' ? PROFESSIONAL_SCENE_BG_CSS : SIMPLE_SCENE_BG_CSS
}
