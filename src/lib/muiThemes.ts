import { createTheme, type Theme } from '@mui/material/styles'
import type { UiTheme } from './uiTheme'

export type ChromeCssVars = {
  '--bg-app': string
  '--bg-panel': string
  '--bg-header': string
  '--bg-input': string
  '--bg-hover': string
  '--border': string
  '--border-strong': string
  '--text': string
  '--text-muted': string
  '--accent': string
  '--danger': string
  '--color-base-100': string
  '--color-base-200': string
  '--color-base-300': string
  '--color-base-content': string
  '--color-primary': string
  '--color-error': string
}

type ThemePaletteDef = {
  primary: string
  primaryContrast: string
  secondary: string
  secondaryContrast: string
  background: string
  paper: string
  elevated: string
  input: string
  hover: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  error: string
  errorContrast: string
  info: string
  success: string
  warning: string
}

/** SwiftMesh brand + daisyUI-equivalent dark / business / night palettes. */
const PALETTES: Record<UiTheme, ThemePaletteDef> = {
  swiftmesh: {
    primary: '#ec7700',
    primaryContrast: '#1a1208',
    secondary: '#555555',
    secondaryContrast: '#f2f2f2',
    background: '#1c1c1c',
    paper: '#242424',
    elevated: '#2a2a2a',
    input: '#1a1a1a',
    hover: '#303030',
    border: '#3c3c3c',
    borderStrong: '#555555',
    text: '#f2f2f2',
    textMuted: '#a6a6a6',
    error: '#c0392b',
    errorContrast: '#fef2f2',
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#eab308',
  },
  // daisyUI "dark" (approx hex from OKLCH)
  dark: {
    primary: '#7480ff',
    primaryContrast: '#050617',
    secondary: '#ff71cf',
    secondaryContrast: '#190211',
    background: '#1d232a',
    paper: '#191e24',
    elevated: '#15191e',
    input: '#15191e',
    hover: '#2a323c',
    border: '#2a323c',
    borderStrong: '#3d4654',
    text: '#a6adbb',
    textMuted: '#7b8496',
    error: '#ff6270',
    errorContrast: '#190507',
    info: '#00b5ff',
    success: '#00a96e',
    warning: '#ffbe00',
  },
  // daisyUI "business" (light corporate)
  business: {
    primary: '#1c4e80',
    primaryContrast: '#edf2f7',
    secondary: '#7d8692',
    secondaryContrast: '#f4f5f6',
    background: '#ffffff',
    paper: '#e6e6e6',
    elevated: '#d1d5db',
    input: '#f3f4f6',
    hover: '#e5e7eb',
    border: '#d1d5db',
    borderStrong: '#9ca3af',
    text: '#333c4d',
    textMuted: '#6b7280',
    error: '#f04438',
    errorContrast: '#fff5f5',
    info: '#3b82f6',
    success: '#16a34a',
    warning: '#d97706',
  },
  // daisyUI "night"
  night: {
    primary: '#38bdf8',
    primaryContrast: '#002b3d',
    secondary: '#818cf8',
    secondaryContrast: '#0b0f3a',
    background: '#0f172a',
    paper: '#1e293b',
    elevated: '#334155',
    input: '#0b1220',
    hover: '#334155',
    border: '#334155',
    borderStrong: '#475569',
    text: '#b3c5ef',
    textMuted: '#8ba3c7',
    error: '#f87272',
    errorContrast: '#2d0606',
    info: '#3abff8',
    success: '#36d399',
    warning: '#fbbd23',
  },
}

function buildTheme(name: UiTheme, p: ThemePaletteDef): Theme {
  const mode = name === 'business' ? 'light' : 'dark'
  return createTheme({
    palette: {
      mode,
      primary: { main: p.primary, contrastText: p.primaryContrast },
      secondary: { main: p.secondary, contrastText: p.secondaryContrast },
      error: { main: p.error, contrastText: p.errorContrast },
      info: { main: p.info },
      success: { main: p.success },
      warning: { main: p.warning },
      background: { default: p.background, paper: p.paper },
      text: { primary: p.text, secondary: p.textMuted },
      divider: p.border,
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      button: { textTransform: 'none' },
    },
    components: {
      MuiButton: {
        defaultProps: { size: 'small' },
      },
      MuiIconButton: {
        defaultProps: { size: 'small' },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
      },
      MuiDialog: {
        defaultProps: { maxWidth: 'sm' },
      },
      MuiSwitch: {
        defaultProps: {
          disableRipple: true,
          color: 'primary',
        },
        styleOverrides: {
          root: {
            width: 40,
            height: 22,
            padding: 0,
            display: 'inline-flex',
            overflow: 'visible',
          },
          switchBase: {
            padding: 2,
            color: '#ffffff',
            '&.Mui-checked': {
              transform: 'translateX(18px)',
              color: '#ffffff',
              '& + .MuiSwitch-track': {
                backgroundColor: p.primary,
                opacity: 1,
                border: 'none',
              },
              '&.Mui-disabled + .MuiSwitch-track': {
                opacity: 0.45,
              },
            },
            '&.Mui-focusVisible .MuiSwitch-thumb': {
              outline: `2px solid ${p.primary}`,
              outlineOffset: 2,
            },
            '&.Mui-disabled .MuiSwitch-thumb': {
              opacity: 0.7,
            },
            '&.Mui-disabled + .MuiSwitch-track': {
              opacity: 0.45,
            },
          },
          thumb: {
            width: 18,
            height: 18,
            boxShadow: 'none',
            backgroundColor: '#ffffff',
            border: mode === 'light' ? `1px solid ${p.border}` : 'none',
          },
          track: {
            borderRadius: 11,
            opacity: 1,
            backgroundColor:
              mode === 'light' ? mixHex(p.background, '#000000', 0.18) : mixHex(p.background, '#ffffff', 0.22),
            border: 'none',
            transition: 'background-color 0.15s ease',
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: p.background,
            color: p.text,
          },
        },
      },
    },
  })
}

function parseHex(hex: string): [number, number, number] {
  const n = hex.replace('#', '')
  return [
    Number.parseInt(n.slice(0, 2), 16),
    Number.parseInt(n.slice(2, 4), 16),
    Number.parseInt(n.slice(4, 6), 16),
  ]
}

/** Mix two hex colors; `t` is the amount of `b` (0–1). */
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${mix(ar, br)} ${mix(ag, bg)} ${mix(ab, bb)})`
}

export const MUI_THEMES: Record<UiTheme, Theme> = {
  swiftmesh: buildTheme('swiftmesh', PALETTES.swiftmesh),
  dark: buildTheme('dark', PALETTES.dark),
  business: buildTheme('business', PALETTES.business),
  night: buildTheme('night', PALETTES.night),
}

export function getMuiTheme(name: UiTheme): Theme {
  return MUI_THEMES[name]
}

export function getChromeCssVars(name: UiTheme): ChromeCssVars {
  const p = PALETTES[name]
  return {
    '--bg-app': p.background,
    '--bg-panel': p.paper,
    '--bg-header': p.elevated,
    '--bg-input': p.input,
    '--bg-hover': p.hover,
    '--border': p.border,
    '--border-strong': p.borderStrong,
    '--text': p.text,
    '--text-muted': p.textMuted,
    '--accent': p.primary,
    '--danger': p.error,
    '--color-base-100': p.background,
    '--color-base-200': p.paper,
    '--color-base-300': p.elevated,
    '--color-base-content': p.text,
    '--color-primary': p.primary,
    '--color-error': p.error,
  }
}
