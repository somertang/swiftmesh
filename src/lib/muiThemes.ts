import { createTheme, type Theme } from '@mui/material/styles'
import type { UiTheme } from './uiTheme'
import {
  createMinimalShadows,
  MINIMAL_FONT_FAMILY,
  MINIMAL_GREY,
  MINIMAL_RADIUS,
  MINIMAL_TITLEBAR_HEIGHT,
  MINIMAL_TYPOGRAPHY,
  SWIFTMESH_ORANGE,
  type MinimalShadowSet,
} from './minimalTokens'

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
  '--font': string
  '--radius-sm': string
  '--radius': string
  '--radius-lg': string
  '--shadow-z8': string
  '--shadow-card': string
  '--shadow-dropdown': string
  '--shadow-dialog': string
  '--titlebar-height': string
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

/** SwiftMesh brand + daisyUI-equivalent palettes, layered on Minimal greys. */
const PALETTES: Record<UiTheme, ThemePaletteDef> = {
  swiftmesh: {
    primary: SWIFTMESH_ORANGE,
    primaryContrast: '#1a1208',
    secondary: MINIMAL_GREY[600],
    secondaryContrast: '#f2f2f2',
    background: MINIMAL_GREY[900],
    paper: MINIMAL_GREY[800],
    elevated: '#212B36',
    input: '#161C24',
    hover: '#2D3843',
    border: '#2D3843',
    borderStrong: MINIMAL_GREY[700],
    text: '#FFFFFF',
    textMuted: MINIMAL_GREY[500],
    error: '#c0392b',
    errorContrast: '#fef2f2',
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#eab308',
  },
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
  business: {
    primary: '#1c4e80',
    primaryContrast: '#edf2f7',
    secondary: MINIMAL_GREY[600],
    secondaryContrast: MINIMAL_GREY[100],
    background: MINIMAL_GREY[100],
    paper: '#FFFFFF',
    elevated: '#FFFFFF',
    input: MINIMAL_GREY[200],
    hover: MINIMAL_GREY[200],
    border: MINIMAL_GREY[300],
    borderStrong: MINIMAL_GREY[400],
    text: MINIMAL_GREY[800],
    textMuted: MINIMAL_GREY[600],
    error: '#f04438',
    errorContrast: '#fff5f5',
    info: '#3b82f6',
    success: '#16a34a',
    warning: '#d97706',
  },
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

function buildMuiShadows(set: MinimalShadowSet): Theme['shadows'] {
  const shadows = [...createTheme().shadows] as Theme['shadows']
  shadows[1] = set.z1
  shadows[4] = set.z4
  shadows[8] = set.z8
  shadows[12] = set.z12
  shadows[16] = set.z16
  shadows[20] = set.z20
  shadows[24] = set.z24
  return shadows
}

function buildTheme(name: UiTheme, p: ThemePaletteDef): Theme {
  const mode = name === 'business' ? 'light' : 'dark'
  const ink = mode === 'light' ? MINIMAL_GREY[500] : '#000000'
  const shadows = createMinimalShadows(ink)
  const hoverBg = mode === 'light' ? 'rgba(145, 158, 171, 0.08)' : 'rgba(145, 158, 171, 0.12)'

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
      action: {
        hover: hoverBg,
        selected: mode === 'light' ? 'rgba(145, 158, 171, 0.16)' : 'rgba(145, 158, 171, 0.16)',
      },
    },
    shape: { borderRadius: MINIMAL_RADIUS.sm },
    shadows: buildMuiShadows(shadows),
    typography: {
      fontFamily: MINIMAL_TYPOGRAPHY.fontFamily,
      fontWeightRegular: MINIMAL_TYPOGRAPHY.fontWeightRegular,
      fontWeightMedium: MINIMAL_TYPOGRAPHY.fontWeightMedium,
      fontWeightBold: MINIMAL_TYPOGRAPHY.fontWeightBold,
      h1: MINIMAL_TYPOGRAPHY.h1,
      h2: MINIMAL_TYPOGRAPHY.h2,
      h3: MINIMAL_TYPOGRAPHY.h3,
      h4: MINIMAL_TYPOGRAPHY.h4,
      h5: MINIMAL_TYPOGRAPHY.h5,
      h6: MINIMAL_TYPOGRAPHY.h6,
      subtitle1: MINIMAL_TYPOGRAPHY.subtitle1,
      subtitle2: MINIMAL_TYPOGRAPHY.subtitle2,
      body1: MINIMAL_TYPOGRAPHY.body1,
      body2: MINIMAL_TYPOGRAPHY.body2,
      caption: MINIMAL_TYPOGRAPHY.caption,
      overline: MINIMAL_TYPOGRAPHY.overline,
      button: MINIMAL_TYPOGRAPHY.button,
    },
    components: {
      MuiButton: {
        defaultProps: { size: 'small', disableElevation: true },
        styleOverrides: {
          root: {
            fontWeight: 700,
            borderRadius: MINIMAL_RADIUS.sm,
          },
          sizeSmall: {
            minHeight: 30,
            padding: '4px 10px',
          },
          sizeMedium: {
            minHeight: 36,
            padding: '6px 12px',
          },
          sizeLarge: {
            minHeight: 48,
            padding: '8px 16px',
          },
        },
      },
      MuiIconButton: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: {
            borderRadius: MINIMAL_RADIUS.sm,
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: MINIMAL_RADIUS.sm,
            backgroundColor: p.input,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: p.borderStrong,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: p.primary,
              borderWidth: 1,
            },
          },
          notchedOutline: {
            borderColor: p.border,
          },
          input: {
            fontSize: '0.8125rem',
          },
        },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          rounded: {
            borderRadius: MINIMAL_RADIUS.md,
          },
        },
      },
      MuiDialog: {
        defaultProps: { maxWidth: 'sm' },
        styleOverrides: {
          paper: {
            borderRadius: MINIMAL_RADIUS.lg,
            boxShadow: shadows.dialog,
            backgroundImage: 'none',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: MINIMAL_RADIUS.md,
            boxShadow: shadows.dropdown,
            backgroundImage: 'none',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            margin: '0 6px',
            paddingLeft: 10,
            paddingRight: 10,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: MINIMAL_RADIUS.md,
          },
        },
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
            fontFamily: MINIMAL_FONT_FAMILY,
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
  const mode = name === 'business' ? 'light' : 'dark'
  const ink = mode === 'light' ? MINIMAL_GREY[500] : '#000000'
  const shadows = createMinimalShadows(ink)
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
    '--font': MINIMAL_FONT_FAMILY,
    '--radius-sm': `${MINIMAL_RADIUS.sm}px`,
    '--radius': `${MINIMAL_RADIUS.md}px`,
    '--radius-lg': `${MINIMAL_RADIUS.lg}px`,
    '--shadow-z8': shadows.z8,
    '--shadow-card': shadows.card,
    '--shadow-dropdown': shadows.dropdown,
    '--shadow-dialog': shadows.dialog,
    '--titlebar-height': `${MINIMAL_TITLEBAR_HEIGHT}px`,
  }
}
