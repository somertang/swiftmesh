import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getMuiTheme } from '../lib/muiThemes'
import {
  applyUiThemeToDocument,
  isUiTheme,
  readStoredUiTheme,
  writeStoredUiTheme,
  type UiTheme,
} from '../lib/uiTheme'
import { patchPreferences, readPreferences } from '../lib/preferences'

type UiThemeContextValue = {
  uiTheme: UiTheme
  setUiTheme: (theme: UiTheme) => void
}

const UiThemeContext = createContext<UiThemeContextValue | null>(null)

function resolveInitialTheme(): UiTheme {
  if (typeof window === 'undefined') return 'swiftmesh'
  const fromPrefs = readPreferences().uiTheme
  if (isUiTheme(fromPrefs)) return fromPrefs
  return readStoredUiTheme()
}

export function UiThemeProvider({ children }: { children: ReactNode }) {
  const [uiTheme, setUiThemeState] = useState<UiTheme>(resolveInitialTheme)

  const setUiTheme = useCallback((next: UiTheme) => {
    setUiThemeState(next)
    writeStoredUiTheme(next)
    patchPreferences({ uiTheme: next })
    applyUiThemeToDocument(next)
  }, [])

  useEffect(() => {
    applyUiThemeToDocument(uiTheme)
  }, [uiTheme])

  const value = useMemo(() => ({ uiTheme, setUiTheme }), [uiTheme, setUiTheme])
  const muiTheme = useMemo(() => getMuiTheme(uiTheme), [uiTheme])

  return (
    <UiThemeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline enableColorScheme />
        {children}
      </MuiThemeProvider>
    </UiThemeContext.Provider>
  )
}

export function useUiTheme() {
  const ctx = useContext(UiThemeContext)
  if (!ctx) throw new Error('useUiTheme must be used within UiThemeProvider')
  return ctx
}
