/**
 * Minimal Web v7 design tokens (minimals.cc / Figma Preview).
 * Figma MCP was unavailable at extract time; values match the public kit:
 * Public Sans, 8px radius, grey.50–900, custom z-shadows, 8px spacing grid.
 * SwiftMesh keeps its orange `#ec7700` as the default primary accent.
 */

export const MINIMAL_FONT_FAMILY =
  '"Public Sans", "Segoe UI", system-ui, -apple-system, sans-serif'

export const MINIMAL_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
} as const

export const MINIMAL_TITLEBAR_HEIGHT = 44

/** Minimal grey scale (light kit). */
export const MINIMAL_GREY = {
  50: '#FCFDFD',
  100: '#F9FAFB',
  200: '#F4F6F8',
  300: '#DFE3E8',
  400: '#C4CDD5',
  500: '#919EAB',
  600: '#637381',
  700: '#454F5B',
  800: '#1C252E',
  900: '#141A21',
} as const

export const SWIFTMESH_ORANGE = '#ec7700'

export type MinimalShadowSet = {
  z1: string
  z4: string
  z8: string
  z12: string
  z16: string
  z20: string
  z24: string
  card: string
  dropdown: string
  dialog: string
}

function hexToRgbChannel(hex: string): string {
  const n = hex.replace('#', '')
  const r = Number.parseInt(n.slice(0, 2), 16)
  const g = Number.parseInt(n.slice(2, 4), 16)
  const b = Number.parseInt(n.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

function alpha(hex: string, a: number): string {
  return `rgba(${hexToRgbChannel(hex).replace(/ /g, ', ')}, ${a})`
}

/** Minimal custom shadows; `ink` is grey.500 in light, black in dark. */
export function createMinimalShadows(ink: string): MinimalShadowSet {
  return {
    z1: `0 1px 2px 0 ${alpha(ink, 0.16)}`,
    z4: `0 4px 8px 0 ${alpha(ink, 0.16)}`,
    z8: `0 8px 16px 0 ${alpha(ink, 0.16)}`,
    z12: `0 12px 24px -4px ${alpha(ink, 0.16)}`,
    z16: `0 16px 32px -4px ${alpha(ink, 0.16)}`,
    z20: `0 20px 40px -4px ${alpha(ink, 0.16)}`,
    z24: `0 24px 48px 0 ${alpha(ink, 0.16)}`,
    card: `0 0 2px 0 ${alpha(ink, 0.2)}, 0 12px 24px -4px ${alpha(ink, 0.12)}`,
    dropdown: `0 0 2px 0 ${alpha(ink, 0.24)}, -20px 20px 40px -4px ${alpha(ink, 0.24)}`,
    dialog: `-40px 40px 80px -8px ${alpha(ink, 0.24)}`,
  }
}

export const MINIMAL_TYPOGRAPHY = {
  fontFamily: MINIMAL_FONT_FAMILY,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightSemiBold: 600,
  fontWeightBold: 700,
  h1: { fontWeight: 800, fontSize: '2.5rem', lineHeight: 80 / 64 },
  h2: { fontWeight: 800, fontSize: '2rem', lineHeight: 64 / 48 },
  h3: { fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.5 },
  h4: { fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.5 },
  h5: { fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.5 },
  h6: { fontWeight: 600, fontSize: '1.0625rem', lineHeight: 28 / 18 },
  subtitle1: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5 },
  subtitle2: { fontWeight: 600, fontSize: '0.875rem', lineHeight: 22 / 14 },
  body1: { fontWeight: 400, fontSize: '1rem', lineHeight: 1.5 },
  body2: { fontWeight: 400, fontSize: '0.875rem', lineHeight: 22 / 14 },
  caption: { fontWeight: 400, fontSize: '0.75rem', lineHeight: 1.5 },
  overline: {
    fontWeight: 700,
    fontSize: '0.75rem',
    lineHeight: 1.5,
    textTransform: 'uppercase' as const,
  },
  button: {
    fontWeight: 700,
    fontSize: '0.875rem',
    lineHeight: 24 / 14,
    textTransform: 'none' as const,
  },
}
