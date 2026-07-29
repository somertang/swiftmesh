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

function processPlatformFallbackPad(): number {
  return /Windows/i.test(navigator.userAgent) ? 138 : 0
}

declare global {
  interface Navigator {
    windowControlsOverlay?: {
      getTitlebarAreaRect: () => DOMRect
      addEventListener: (type: 'geometrychange', listener: () => void) => void
      removeEventListener: (type: 'geometrychange', listener: () => void) => void
    }
  }
}

function MenuItem({
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
    <li>
      <button
        type="button"
        role="menuitem"
        className={`flex w-full justify-between gap-6${danger ? ' text-error' : ''}`}
        disabled={disabled}
        onClick={onClick}
      >
        <span className="truncate">{label}</span>
        {shortcut ? <kbd className="shrink-0 font-sans text-xs opacity-60">{shortcut}</kbd> : null}
        {children}
      </button>
    </li>
  )
}

function MenuSep() {
  return <li role="separator" />
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
    void window.desktop?.getWindowChrome().then(chrome => {
      setShowDevTools(!chrome.isPackaged)
      if (!chrome.titleBarOverlay) setOverlayPad(0)
    })

    const wco = window.navigator.windowControlsOverlay
    if (!wco) {
      setOverlayPad(processPlatformFallbackPad())
      return
    }
    const update = () => {
      const rect = wco.getTitlebarAreaRect()
      setOverlayPad(Math.max(0, Math.round(window.innerWidth - rect.x - rect.width)))
    }
    update()
    wco.addEventListener('geometrychange', update)
    return () => wco.removeEventListener('geometrychange', update)
  }, [])

  useEffect(() => {
    if (!window.desktop?.getRecentPaths) return
    void window.desktop.getRecentPaths().then(setRecentPaths)
    return window.desktop.onRecentPathsChanged(setRecentPaths)
  }, [])

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
  } as CSSProperties

  const toggleMenu = (id: Exclude<MenuId, null>) => {
    setRecentOpen(false)
    setOpenMenu(prev => (prev === id ? null : id))
  }

  return (
    <header ref={rootRef} className="app-titlebar" style={style}>
      <div className="app-titlebar-left">
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
              <ul className="app-titlebar-dropdown menu menu-sm bg-base-200 rounded-box shadow-lg p-1" role="menu">
                <MenuItem
                  label={t('menu.open')}
                  shortcut="Ctrl+O"
                  onClick={() => run(onOpenFile)}
                />
                <li
                  className={`app-titlebar-submenu${recentOpen ? ' is-open' : ''}`}
                  onMouseEnter={openRecentMenu}
                  onMouseLeave={scheduleCloseRecentMenu}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full justify-between gap-6"
                    onClick={() => {
                      clearRecentCloseTimer()
                      setRecentOpen(v => !v)
                    }}
                  >
                    <span>{t('menu.openRecent')}</span>
                    <span className="app-titlebar-submenu-chevron opacity-60" aria-hidden>
                      ›
                    </span>
                  </button>
                  {recentOpen ? (
                    <ul
                      className="app-titlebar-dropdown app-titlebar-dropdown--flyout menu menu-sm bg-base-200 rounded-box shadow-lg p-1"
                      role="menu"
                    >
                      {recentPaths.length === 0 ? (
                        <MenuItem label={t('menu.noRecent')} disabled />
                      ) : (
                        recentPaths.map(filePath => (
                          <MenuItem
                            key={filePath}
                            label={basenamePath(filePath)}
                            onClick={() => run(() => onOpenRecentPath(filePath))}
                          />
                        ))
                      )}
                      <MenuSep />
                      <MenuItem
                        label={t('menu.clearRecent')}
                        disabled={recentPaths.length === 0}
                        onClick={() =>
                          run(() => {
                            void window.desktop?.clearRecentPaths()
                          })
                        }
                      />
                    </ul>
                  ) : null}
                </li>
                <MenuSep />
                <MenuItem
                  label={t('menu.preferencesOpen')}
                  shortcut="Ctrl+,"
                  onClick={() => run(onOpenPreferences)}
                />
                <MenuSep />
                <MenuItem label={t('menu.quit')} onClick={() => runWindow('quit')} />
              </ul>
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
              <ul className="app-titlebar-dropdown menu menu-sm bg-base-200 rounded-box shadow-lg p-1" role="menu">
                <MenuItem
                  label={t('menu.toggleStatusBar')}
                  shortcut="Ctrl+B"
                  onClick={() => run(onToggleStatusBar)}
                />
                <MenuSep />
                <MenuItem label={t('menu.reload')} onClick={() => runWindow('reload')} />
                {showDevTools ? (
                  <MenuItem
                    label={t('menu.toggleDevTools')}
                    onClick={() => runWindow('toggleDevTools')}
                  />
                ) : null}
                <MenuSep />
                <MenuItem label={t('menu.resetZoom')} onClick={() => runWindow('resetZoom')} />
                <MenuItem label={t('menu.zoomIn')} onClick={() => runWindow('zoomIn')} />
                <MenuItem label={t('menu.zoomOut')} onClick={() => runWindow('zoomOut')} />
                <MenuSep />
                <MenuItem
                  label={t('menu.toggleFullscreen')}
                  onClick={() => runWindow('toggleFullscreen')}
                />
              </ul>
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
              <ul className="app-titlebar-dropdown menu menu-sm bg-base-200 rounded-box shadow-lg p-1" role="menu">
                <MenuItem label={t('menu.about')} onClick={() => runWindow('showAbout')} />
              </ul>
            ) : null}
          </div>
        </nav>
      </div>

      <div className="app-titlebar-title" title={title}>
        {title}
      </div>
      <div className="app-titlebar-right" aria-hidden />
    </header>
  )
}
