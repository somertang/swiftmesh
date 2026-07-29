export const UI_THEMES = ['swiftmesh', 'dark', 'business', 'night'] as const

export type UiTheme = (typeof UI_THEMES)[number]

export const DEFAULT_UI_THEME: UiTheme = 'swiftmesh'

export const UI_THEME_STORAGE_KEY = 'swiftmesh.uiTheme'

export function isUiTheme(value: unknown): value is UiTheme {
  return typeof value === 'string' && (UI_THEMES as readonly string[]).includes(value)
}

export function readStoredUiTheme(): UiTheme {
  try {
    const raw = localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (isUiTheme(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_THEME
}

export function writeStoredUiTheme(theme: UiTheme) {
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function applyUiThemeToDocument(theme: UiTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}
