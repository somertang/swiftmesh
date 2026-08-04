import Divider from '@mui/material/Divider'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import MenuList from '@mui/material/MenuList'
import Paper from '@mui/material/Paper'
import logoUrl from '../assets/logo.png'
import { useT } from '../i18n'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

type MenuId = 'file' | 'view' | 'help' | null

type AppTitleBarProps = {
  title: string
  onOpenFile: () => void
  onOpenPreferences: () => void
  onToggleStatusBar: () => void
  onOpenRecentPath: (filePath: string) => void
}

function basenamePath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

const WINDOWS_OVERLAY_FALLBACK_PAD = 138

declare global {
  interface Navigator {
    windowControlsOverlay?: {
      getTitlebarAreaRect: () => DOMRect
      addEventListener: (type: 'geometrychange', listener: () => void) => void
      removeEventListener: (type: 'geometrychange', listener: () => void) => void
    }
  }
}

function TitleBarMenuItem({
  label,
  shortcut,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  onClick?: () => void
  children?: ReactNode
}) {
  return (
    <MenuItem
      disabled={disabled}
      onClick={onClick}
      dense
      sx={danger ? { color: 'error.main' } : undefined}
    >
      <ListItemText primary={label} />
      {shortcut ? <kbd className="shrink-0 font-sans text-xs opacity-60">{shortcut}</kbd> : null}
      {children}
    </MenuItem>
  )
}

export function AppTitleBar({
  title,
  onOpenFile,
  onOpenPreferences,
  onToggleStatusBar,
  onOpenRecentPath,
}: AppTitleBarProps) {
  const t = useT()
  const rootRef = useRef<HTMLElement>(null)
  const [openMenu, setOpenMenu] = useState<MenuId>(null)
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [recentOpen, setRecentOpen] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)
  const [overlayPad, setOverlayPad] = useState(0)
  const [insetLeft, setInsetLeft] = useState(0)
  const [useInAppMenus, setUseInAppMenus] = useState(true)
  const recentCloseTimerRef = useRef<number | null>(null)

  const clearRecentCloseTimer = useCallback(() => {
    if (recentCloseTimerRef.current != null) {
      window.clearTimeout(recentCloseTimerRef.current)
      recentCloseTimerRef.current = null
    }
  }, [])

  const openRecentMenu = useCallback(() => {
    clearRecentCloseTimer()
    setRecentOpen(true)
  }, [clearRecentCloseTimer])

  const scheduleCloseRecentMenu = useCallback(() => {
    clearRecentCloseTimer()
    recentCloseTimerRef.current = window.setTimeout(() => {
      setRecentOpen(false)
      recentCloseTimerRef.current = null
    }, 150)
  }, [clearRecentCloseTimer])

  const closeMenus = useCallback(() => {
    clearRecentCloseTimer()
    setOpenMenu(null)
    setRecentOpen(false)
  }, [clearRecentCloseTimer])

  useEffect(() => {
    return () => clearRecentCloseTimer()
  }, [clearRecentCloseTimer])

  useEffect(() => {
    let cancelled = false
    let removeWco: (() => void) | undefined

    void window.desktop?.getWindowChrome().then(chrome => {
      if (cancelled) return
      setShowDevTools(!chrome.isPackaged)
      setInsetLeft(chrome.controlsInsetLeft)
      setUseInAppMenus(chrome.platform !== 'darwin')

      if (!chrome.titleBarOverlay) {
        setOverlayPad(0)
        return
      }

      const wco = window.navigator.windowControlsOverlay
      if (!wco) {
        setOverlayPad(WINDOWS_OVERLAY_FALLBACK_PAD)
        return
      }
      const update = () => {
        const rect = wco.getTitlebarAreaRect()
        setOverlayPad(Math.max(0, Math.round(window.innerWidth - rect.x - rect.width)))
      }
      update()
      wco.addEventListener('geometrychange', update)
      removeWco = () => wco.removeEventListener('geometrychange', update)
    })

    return () => {
      cancelled = true
      removeWco?.()
    }
  }, [])

  useEffect(() => {
    if (!useInAppMenus || !window.desktop?.getRecentPaths) return
    void window.desktop.getRecentPaths().then(setRecentPaths)
    return window.desktop.onRecentPathsChanged(setRecentPaths)
  }, [useInAppMenus])

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (rootRef.current?.contains(target)) return
      closeMenus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu, closeMenus])

  const run = (action: () => void) => {
    action()
    closeMenus()
  }

  const runWindow = (action: Parameters<NonNullable<typeof window.desktop>['windowMenuAction']>[0]) => {
    void window.desktop?.windowMenuAction(action)
    closeMenus()
  }

  const style = {
    ['--titlebar-overlay-pad' as string]: `${overlayPad}px`,
    ['--titlebar-inset-left' as string]: `${insetLeft}px`,
  } as CSSProperties

  const toggleMenu = (id: Exclude<MenuId, null>) => {
    setRecentOpen(false)
    setOpenMenu(prev => (prev === id ? null : id))
  }

  return (
    <header ref={rootRef} className="app-titlebar" style={style}>
      <div className="app-titlebar-left">
        {useInAppMenus ? (
          <>
            <img src={logoUrl} alt="" className="app-titlebar-logo" draggable={false} />
            <nav className="app-titlebar-menus" aria-label="Application">
              <div className={`app-titlebar-menu${openMenu === 'file' ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="app-titlebar-menu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'file'}
                  onClick={() => toggleMenu('file')}
                >
                  {t('menu.file')}
                </button>
                {openMenu === 'file' ? (
                  <Paper className="app-titlebar-dropdown" elevation={8}>
                    <MenuList dense>
                      <TitleBarMenuItem
                        label={t('menu.open')}
                        shortcut="Ctrl+O"
                        onClick={() => run(onOpenFile)}
                      />
                      <li
                        className={`app-titlebar-submenu${recentOpen ? ' is-open' : ''}`}
                        onMouseEnter={openRecentMenu}
                        onMouseLeave={scheduleCloseRecentMenu}
                      >
                        <MenuItem
                          dense
                          onClick={() => {
                            clearRecentCloseTimer()
                            setRecentOpen(v => !v)
                          }}
                        >
                          <ListItemText primary={t('menu.openRecent')} />
                          <span className="app-titlebar-submenu-chevron opacity-60" aria-hidden>
                            ›
                          </span>
                        </MenuItem>
                        {recentOpen ? (
                          <Paper
                            className="app-titlebar-dropdown app-titlebar-dropdown--flyout"
                            elevation={8}
                          >
                            <MenuList dense>
                              {recentPaths.length === 0 ? (
                                <TitleBarMenuItem label={t('menu.noRecent')} disabled />
                              ) : (
                                recentPaths.map(filePath => (
                                  <TitleBarMenuItem
                                    key={filePath}
                                    label={basenamePath(filePath)}
                                    onClick={() => run(() => onOpenRecentPath(filePath))}
                                  />
                                ))
                              )}
                              <Divider component="li" />
                              <TitleBarMenuItem
                                label={t('menu.clearRecent')}
                                disabled={recentPaths.length === 0}
                                onClick={() =>
                                  run(() => {
                                    void window.desktop?.clearRecentPaths()
                                  })
                                }
                              />
                            </MenuList>
                          </Paper>
                        ) : null}
                      </li>
                      <Divider component="li" />
                      <TitleBarMenuItem
                        label={t('menu.preferencesOpen')}
                        shortcut="Ctrl+,"
                        onClick={() => run(onOpenPreferences)}
                      />
                      <Divider component="li" />
                      <TitleBarMenuItem label={t('menu.quit')} onClick={() => runWindow('quit')} />
                    </MenuList>
                  </Paper>
                ) : null}
              </div>

              <div className={`app-titlebar-menu${openMenu === 'view' ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="app-titlebar-menu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'view'}
                  onClick={() => toggleMenu('view')}
                >
                  {t('menu.view')}
                </button>
                {openMenu === 'view' ? (
                  <Paper className="app-titlebar-dropdown" elevation={8}>
                    <MenuList dense>
                      <TitleBarMenuItem
                        label={t('menu.toggleStatusBar')}
                        shortcut="Ctrl+B"
                        onClick={() => run(onToggleStatusBar)}
                      />
                      <Divider component="li" />
                      <TitleBarMenuItem label={t('menu.reload')} onClick={() => runWindow('reload')} />
                      {showDevTools ? (
                        <TitleBarMenuItem
                          label={t('menu.toggleDevTools')}
                          onClick={() => runWindow('toggleDevTools')}
                        />
                      ) : null}
                      <Divider component="li" />
                      <TitleBarMenuItem
                        label={t('menu.resetZoom')}
                        onClick={() => runWindow('resetZoom')}
                      />
                      <TitleBarMenuItem label={t('menu.zoomIn')} onClick={() => runWindow('zoomIn')} />
                      <TitleBarMenuItem label={t('menu.zoomOut')} onClick={() => runWindow('zoomOut')} />
                      <Divider component="li" />
                      <TitleBarMenuItem
                        label={t('menu.toggleFullscreen')}
                        onClick={() => runWindow('toggleFullscreen')}
                      />
                    </MenuList>
                  </Paper>
                ) : null}
              </div>

              <div className={`app-titlebar-menu${openMenu === 'help' ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="app-titlebar-menu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'help'}
                  onClick={() => toggleMenu('help')}
                >
                  {t('menu.help')}
                </button>
                {openMenu === 'help' ? (
                  <Paper className="app-titlebar-dropdown" elevation={8}>
                    <MenuList dense>
                      <TitleBarMenuItem
                        label={t('menu.userGuide')}
                        onClick={() => runWindow('openUserGuide')}
                      />
                      <TitleBarMenuItem
                        label={t('menu.about')}
                        onClick={() => runWindow('showAbout')}
                      />
                    </MenuList>
                  </Paper>
                ) : null}
              </div>
            </nav>
          </>
        ) : null}
      </div>

      <div className="app-titlebar-title" title={title}>
        {title}
      </div>
      <div className="app-titlebar-right" aria-hidden />
    </header>
  )
}
