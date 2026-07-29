import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  isPreviewTheme,
  readStoredPreviewTheme,
  writeStoredPreviewTheme,
  type PreviewTheme,
} from '../lib/previewTheme'

type PreviewThemeContextValue = {
  previewTheme: PreviewTheme
  setPreviewTheme: (theme: PreviewTheme) => void
}

const PreviewThemeContext = createContext<PreviewThemeContextValue | null>(null)

export function PreviewThemeProvider({ children }: { children: ReactNode }) {
  const [previewTheme, setPreviewThemeState] = useState<PreviewTheme>(() =>
    typeof window !== 'undefined' ? readStoredPreviewTheme() : 'simple'
  )

  const setPreviewTheme = useCallback((next: PreviewTheme) => {
    setPreviewThemeState(next)
    writeStoredPreviewTheme(next)
  }, [])

  useEffect(() => {
    void window.desktop?.setPreviewTheme?.(previewTheme)
  }, [previewTheme])

  useEffect(() => {
    if (!window.desktop?.onPreviewThemeChanged) return
    return window.desktop.onPreviewThemeChanged(next => {
      if (!isPreviewTheme(next)) return
      setPreviewThemeState(next)
      writeStoredPreviewTheme(next)
    })
  }, [])

  const value = useMemo(
    () => ({ previewTheme, setPreviewTheme }),
    [previewTheme, setPreviewTheme]
  )

  return (
    <PreviewThemeContext.Provider value={value}>{children}</PreviewThemeContext.Provider>
  )
}

export function usePreviewTheme() {
  const ctx = useContext(PreviewThemeContext)
  if (!ctx) throw new Error('usePreviewTheme must be used within PreviewThemeProvider')
  return ctx
}
