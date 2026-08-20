import { Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import type { MessageKey } from '../src/i18n/messages'

export type AppMenuTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string

export type DarwinAppMenuHandlers = {
  t: AppMenuTranslate
  recentPaths: string[]
  isPackaged: boolean
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
  onClearRecent: () => void
  onEncryptModel: () => void
  onEncryptModelsBatch: () => void
  onOpenPreferences: () => void
  onToggleStatusBar: () => void
  onReload: () => void
  onToggleDevTools: () => void
  onResetZoom: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onToggleFullscreen: () => void
  onOpenUserGuide: () => void
  onShowAbout: () => void
}

function basenamePath(filePath: string): string {
  return path.basename(filePath) || filePath
}

/** Build the macOS system menu bar (File / View / Help + app menu). */
export function buildDarwinApplicationMenu(handlers: DarwinAppMenuHandlers): Menu {
  const { t, recentPaths, isPackaged } = handlers

  const recentSubmenu: MenuItemConstructorOptions[] =
    recentPaths.length === 0
      ? [{ label: t('menu.noRecent'), enabled: false }]
      : [
          ...recentPaths.map(filePath => ({
            label: basenamePath(filePath),
            click: () => handlers.onOpenRecent(filePath),
          })),
          { type: 'separator' as const },
          {
            label: t('menu.clearRecent'),
            enabled: recentPaths.length > 0,
            click: () => handlers.onClearRecent(),
          },
        ]

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'SwiftMesh',
      submenu: [
        {
          label: t('menu.about'),
          click: () => handlers.onShowAbout(),
        },
        { type: 'separator' },
        {
          label: t('menu.preferencesOpen'),
          accelerator: 'CmdOrCtrl+,',
          click: () => handlers.onOpenPreferences(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.open'),
          accelerator: 'CmdOrCtrl+O',
          click: () => handlers.onOpen(),
        },
        {
          label: t('menu.openRecent'),
          submenu: recentSubmenu,
        },
        {
          label: t('menu.encryptModel'),
          click: () => handlers.onEncryptModel(),
        },
        {
          label: t('menu.encryptBatch'),
          click: () => handlers.onEncryptModelsBatch(),
        },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.toggleStatusBar'),
          accelerator: 'CmdOrCtrl+B',
          click: () => handlers.onToggleStatusBar(),
        },
        { type: 'separator' },
        {
          label: t('menu.reload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => handlers.onReload(),
        },
        ...(isPackaged
          ? []
          : [
              {
                label: t('menu.toggleDevTools'),
                accelerator: 'Alt+CmdOrCtrl+I',
                click: () => handlers.onToggleDevTools(),
              } satisfies MenuItemConstructorOptions,
            ]),
        { type: 'separator' },
        {
          label: t('menu.resetZoom'),
          accelerator: 'CmdOrCtrl+0',
          click: () => handlers.onResetZoom(),
        },
        {
          label: t('menu.zoomIn'),
          accelerator: 'CmdOrCtrl+=',
          click: () => handlers.onZoomIn(),
        },
        {
          label: t('menu.zoomOut'),
          accelerator: 'CmdOrCtrl+-',
          click: () => handlers.onZoomOut(),
        },
        { type: 'separator' },
        {
          label: t('menu.toggleFullscreen'),
          accelerator: 'Ctrl+Cmd+F',
          click: () => handlers.onToggleFullscreen(),
        },
      ],
    },
    {
      label: t('menu.help'),
      role: 'help',
      submenu: [
        {
          label: t('menu.userGuide'),
          click: () => handlers.onOpenUserGuide(),
        },
        {
          label: t('menu.about'),
          click: () => handlers.onShowAbout(),
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
