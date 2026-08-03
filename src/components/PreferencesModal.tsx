import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import {
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import {
  LIGHTING_MODE_OPTIONS,
  type LightingMode,
  type LightingSettings,
} from '../config/lightingDefaults'
import type { RecordingExportFormat, UpdateStatus } from '../desktopTypes'
import { Icon } from '../icons'
import { useLocale, useT, type MessageKey } from '../i18n'
import type { Locale } from '../i18n/messages'
import {
  DEFAULT_RECENT_FILES_MAX,
  MAX_TEXTURE_SIZE_OPTIONS,
  RECENT_FILES_MAX_MAX,
  RECENT_FILES_MAX_MIN,
  patchPreferences,
  readPreferences,
  resetPreferences,
  type AppPreferences,
  type GeneralPreferences,
  type MaxTextureSizeOption,
  type PerformancePreferences,
  type RecordingPreferences,
  type StartupBehavior,
} from '../lib/preferences'
import {
  normalizeRecordingQuality,
  RECORDING_EXPORT_FORMAT_OPTIONS,
  RECORDING_QUALITY_OPTIONS,
  RECORDING_SIZE_PRESETS,
} from '../lib/recordingPresets'
import { usePreviewTheme } from '../previewTheme'
import type { PreviewTheme } from '../lib/previewTheme'
import { DEFAULT_SECONDS_PER_REV } from '../lib/modelTab'
import {
  APP_AUTHOR,
  APP_LICENSE_SPDX,
  APP_REPOSITORY_URL,
} from '../lib/openSource'
import { useUiTheme } from '../uiTheme'
import { UI_THEMES, type UiTheme } from '../lib/uiTheme'

export type PreferencesSection =
  | 'general'
  | 'appearance'
  | 'performance'
  | 'recording'
  | 'lighting'
  | 'about'

type Props = {
  open: boolean
  onClose: () => void
  initialSection?: PreferencesSection
  onPreferencesChange?: (prefs: AppPreferences) => void
}

const NAV: { id: PreferencesSection; labelKey: MessageKey; icon: string }[] = [
  { id: 'general', labelKey: 'prefs.nav.general', icon: 'material-symbols:adjust' },
  { id: 'appearance', labelKey: 'prefs.nav.appearance', icon: 'material-symbols:palette' },
  { id: 'performance', labelKey: 'prefs.nav.performance', icon: 'material-symbols:blur-circular-outline' },
  { id: 'recording', labelKey: 'prefs.nav.recording', icon: 'material-symbols:circle' },
  { id: 'lighting', labelKey: 'prefs.nav.lighting', icon: 'material-symbols:contrast' },
  { id: 'about', labelKey: 'prefs.nav.about', icon: 'material-symbols:info' },
]

type SettingId =
  | 'language'
  | 'startupBehavior'
  | 'recentFilesMax'
  | 'statusBarVisible'
  | 'confirmCloseTabs'
  | 'appUpdate'
  | 'autoUpdate'
  | 'resetPrefs'
  | 'uiTheme'
  | 'modelTheme'
  | 'msaa'
  | 'maxTextureSize'
  | 'autoReloadOnChange'
  | 'cacheLocation'
  | 'cachePath'
  | 'telemetry'
  | 'recordingEnabled'
  | 'secPerRev'
  | 'export'
  | 'size'
  | 'quality'
  | 'outputLocation'
  | 'outputPath'
  | 'lightingMode'
  | 'exposure'
  | 'envIntensity'
  | 'aboutAuthor'
  | 'aboutRepository'
  | 'aboutLicense'

const SETTING_META: Record<
  SettingId,
  { section: PreferencesSection; titleKey: MessageKey; descKey: MessageKey }
> = {
  language: {
    section: 'general',
    titleKey: 'menu.language',
    descKey: 'prefs.desc.language',
  },
  startupBehavior: {
    section: 'general',
    titleKey: 'prefs.startupBehavior',
    descKey: 'prefs.desc.startupBehavior',
  },
  recentFilesMax: {
    section: 'general',
    titleKey: 'prefs.recentFilesMax',
    descKey: 'prefs.desc.recentFilesMax',
  },
  statusBarVisible: {
    section: 'general',
    titleKey: 'prefs.statusBarVisible',
    descKey: 'prefs.desc.statusBarVisible',
  },
  confirmCloseTabs: {
    section: 'general',
    titleKey: 'prefs.confirmCloseTabs',
    descKey: 'prefs.desc.confirmCloseTabs',
  },
  appUpdate: {
    section: 'general',
    titleKey: 'prefs.appUpdate',
    descKey: 'prefs.desc.appUpdate',
  },
  autoUpdate: {
    section: 'general',
    titleKey: 'prefs.autoUpdate',
    descKey: 'prefs.desc.autoUpdate',
  },
  resetPrefs: {
    section: 'general',
    titleKey: 'prefs.reset',
    descKey: 'prefs.desc.reset',
  },
  uiTheme: {
    section: 'appearance',
    titleKey: 'prefs.uiTheme',
    descKey: 'prefs.desc.uiTheme',
  },
  modelTheme: {
    section: 'appearance',
    titleKey: 'menu.modelTheme',
    descKey: 'prefs.desc.modelTheme',
  },
  msaa: {
    section: 'performance',
    titleKey: 'prefs.msaa',
    descKey: 'prefs.desc.msaa',
  },
  maxTextureSize: {
    section: 'performance',
    titleKey: 'prefs.maxTextureSize',
    descKey: 'prefs.desc.maxTextureSize',
  },
  autoReloadOnChange: {
    section: 'performance',
    titleKey: 'prefs.autoReloadOnChange',
    descKey: 'prefs.desc.autoReloadOnChange',
  },
  cacheLocation: {
    section: 'performance',
    titleKey: 'prefs.cacheLocation',
    descKey: 'prefs.desc.cacheLocation',
  },
  cachePath: {
    section: 'performance',
    titleKey: 'prefs.cachePath',
    descKey: 'prefs.desc.cachePath',
  },
  telemetry: {
    section: 'performance',
    titleKey: 'prefs.telemetry',
    descKey: 'prefs.desc.telemetry',
  },
  recordingEnabled: {
    section: 'recording',
    titleKey: 'prefs.recording.enabled',
    descKey: 'prefs.desc.recordingEnabled',
  },
  secPerRev: {
    section: 'recording',
    titleKey: 'record.secPerRev',
    descKey: 'prefs.desc.secPerRev',
  },
  export: {
    section: 'recording',
    titleKey: 'record.export',
    descKey: 'prefs.desc.export',
  },
  size: {
    section: 'recording',
    titleKey: 'record.size',
    descKey: 'prefs.desc.size',
  },
  quality: {
    section: 'recording',
    titleKey: 'record.quality',
    descKey: 'prefs.desc.quality',
  },
  outputLocation: {
    section: 'recording',
    titleKey: 'record.outputLocation',
    descKey: 'prefs.desc.outputLocation',
  },
  outputPath: {
    section: 'recording',
    titleKey: 'record.outputPath',
    descKey: 'prefs.desc.outputPath',
  },
  lightingMode: {
    section: 'lighting',
    titleKey: 'lighting.mode',
    descKey: 'prefs.desc.lightingMode',
  },
  exposure: {
    section: 'lighting',
    titleKey: 'lighting.exposure',
    descKey: 'prefs.desc.exposure',
  },
  envIntensity: {
    section: 'lighting',
    titleKey: 'lighting.envIntensity',
    descKey: 'prefs.desc.envIntensity',
  },
  aboutAuthor: {
    section: 'about',
    titleKey: 'prefs.about.author',
    descKey: 'prefs.desc.about.author',
  },
  aboutRepository: {
    section: 'about',
    titleKey: 'prefs.about.repository',
    descKey: 'prefs.desc.about.repository',
  },
  aboutLicense: {
    section: 'about',
    titleKey: 'prefs.about.license',
    descKey: 'prefs.desc.about.license',
  },
}

function matchesQuery(query: string, ...texts: string[]) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return texts.some(text => text.toLowerCase().includes(q))
}

function PrefGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="prefs-group">
      <h4 className="prefs-group-title">{title}</h4>
      {children}
    </section>
  )
}

function PrefRow({
  id,
  title,
  description,
  controlClassName,
  layout = 'row',
  children,
}: {
  id?: string
  title: string
  description: string
  controlClassName?: string
  layout?: 'row' | 'stack'
  children: ReactNode
}) {
  return (
    <div className={`prefs-row${layout === 'stack' ? ' is-stack' : ''}`}>
      <div className="prefs-row-text">
        {id ? (
          <label className="prefs-row-title" htmlFor={id}>
            {title}
          </label>
        ) : (
          <span className="prefs-row-title">{title}</span>
        )}
        <p className="prefs-row-desc">{description}</p>
      </div>
      <div className={`prefs-row-control${controlClassName ? ` ${controlClassName}` : ''}`}>
        {children}
      </div>
    </div>
  )
}

function PrefToggle({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <Switch
      id={id}
      checked={checked}
      disabled={disabled}
      onChange={(_, next) => onChange(next)}
    />
  )
}

function formatUpdateStatus(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  status: UpdateStatus,
  currentVersion: string
): string {
  switch (status.phase) {
    case 'idle':
      return t('prefs.desc.appUpdate')
    case 'dev':
      return t('update.devMessage')
    case 'checking':
      return t('prefs.updateStatus.checking')
    case 'upToDate':
      return t('update.upToDateMessage', { version: status.version || currentVersion })
    case 'available':
      return t('prefs.updateStatus.available', { version: status.version })
    case 'downloading':
      return t('prefs.updateStatus.downloading', { percent: Math.round(status.percent) })
    case 'ready':
      return t('prefs.updateStatus.ready', { version: status.version })
    case 'error':
      return status.message || t('update.errorMessage')
  }
}

export const PreferencesModal: FC<Props> = ({
  open,
  onClose,
  initialSection = 'general',
  onPreferencesChange,
}) => {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const { previewTheme, setPreviewTheme } = usePreviewTheme()
  const { uiTheme, setUiTheme } = useUiTheme()
  const [section, setSection] = useState<PreferencesSection>(initialSection)
  const [prefs, setPrefs] = useState<AppPreferences>(() => readPreferences())
  const [search, setSearch] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ phase: 'idle' })

  useEffect(() => {
    if (!open) return
    setSection(initialSection)
    setPrefs(readPreferences())
    setSearch('')
  }, [open, initialSection])

  useEffect(() => {
    if (!open || !window.desktop?.getAppVersion) return
    let cancelled = false
    void (async () => {
      try {
        const [version, status] = await Promise.all([
          window.desktop!.getAppVersion!(),
          window.desktop!.getUpdateStatus?.() ?? Promise.resolve({ phase: 'idle' as const }),
        ])
        if (cancelled) return
        setAppVersion(version)
        setUpdateStatus(status)
      } catch {
        /* ignore */
      }
    })()
    const unsub = window.desktop.onUpdateStatus?.(status => setUpdateStatus(status))
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [open])

  const desktopAvailable = Boolean(window.desktop)

  const updateRecording = (patch: Partial<RecordingPreferences>) => {
    const next = patchPreferences({ recording: patch })
    setPrefs(next)
    onPreferencesChange?.(next)
  }

  const updateLighting = (patch: Partial<LightingSettings>) => {
    const next = patchPreferences({ lighting: patch })
    setPrefs(next)
    onPreferencesChange?.(next)
  }

  const updateGeneral = (patch: Partial<GeneralPreferences>) => {
    const next = patchPreferences({ general: patch })
    setPrefs(next)
    onPreferencesChange?.(next)
    if (patch.recentFilesMax !== undefined && window.desktop?.setRecentMax) {
      void window.desktop.setRecentMax(patch.recentFilesMax)
    }
    if (patch.autoUpdate !== undefined && window.desktop?.setAutoUpdateEnabled) {
      void window.desktop.setAutoUpdateEnabled(patch.autoUpdate)
    }
  }

  const updatePerformance = (patch: Partial<PerformancePreferences>) => {
    const next = patchPreferences({ performance: patch })
    setPrefs(next)
    onPreferencesChange?.(next)
    if (patch.cacheDir !== undefined && window.desktop?.setCacheDir) {
      void window.desktop.setCacheDir(patch.cacheDir)
    }
  }

  const handleResetPreferences = () => {
    if (!window.confirm(t('prefs.reset.confirm'))) return
    const next = resetPreferences()
    setPrefs(next)
    setUiTheme(next.uiTheme)
    onPreferencesChange?.(next)
    if (window.desktop?.setRecentMax) {
      void window.desktop.setRecentMax(DEFAULT_RECENT_FILES_MAX)
    }
    if (window.desktop?.setCacheDir) {
      void window.desktop.setCacheDir(next.performance.cacheDir)
    }
    if (window.desktop?.setAutoUpdateEnabled) {
      void window.desktop.setAutoUpdateEnabled(next.general.autoUpdate)
    }
  }

  const chooseOutputDir = async (): Promise<string | null> => {
    if (!window.desktop?.chooseRecordingOutputDir) return null
    const dir = await window.desktop.chooseRecordingOutputDir()
    return dir || null
  }

  const chooseCacheDir = async (): Promise<string | null> => {
    if (!window.desktop?.chooseCacheDir) return null
    const dir = await window.desktop.chooseCacheDir()
    return dir || null
  }

  const openProjectRepository = async () => {
    if (window.desktop?.openExternalUrl) {
      await window.desktop.openExternalUrl(APP_REPOSITORY_URL)
      return
    }
    window.open(APP_REPOSITORY_URL, '_blank', 'noopener,noreferrer')
  }

  const onCacheLocationChange = async (mode: 'system' | 'folder') => {
    if (mode === 'system') {
      updatePerformance({ cacheDir: '' })
      return
    }
    if (prefs.performance.cacheDir) return
    const dir = await chooseCacheDir()
    if (dir) updatePerformance({ cacheDir: dir })
  }

  const onOutputLocationChange = async (mode: 'ask' | 'folder') => {
    if (mode === 'ask') {
      updateRecording({ outputDir: '' })
      return
    }
    if (prefs.recording.outputDir) return
    const dir = await chooseOutputDir()
    if (dir) updateRecording({ outputDir: dir })
  }

  const visibleById = useMemo(() => {
    const map = {} as Record<SettingId, boolean>
    for (const id of Object.keys(SETTING_META) as SettingId[]) {
      const meta = SETTING_META[id]
      map[id] = matchesQuery(search, t(meta.titleKey), t(meta.descKey))
    }
    return map
  }, [search, t])

  const sectionHasVisible = useMemo(() => {
    const map = {} as Record<PreferencesSection, boolean>
    for (const item of NAV) {
      map[item.id] = (Object.keys(SETTING_META) as SettingId[]).some(
        id => SETTING_META[id].section === item.id && visibleById[id]
      )
    }
    return map
  }, [visibleById])

  const visibleNav = useMemo(
    () => NAV.filter(item => !search.trim() || sectionHasVisible[item.id]),
    [search, sectionHasVisible]
  )

  useEffect(() => {
    if (!open) return
    if (!search.trim()) return
    if (sectionHasVisible[section]) return
    const first = visibleNav[0]
    if (first) setSection(first.id)
  }, [open, search, section, sectionHasVisible, visibleNav])

  const sectionTitle = useMemo(() => {
    const item = NAV.find(n => n.id === section)
    return item ? t(item.labelKey) : ''
  }, [section, t])

  const show = (id: SettingId) => visibleById[id]

  const hasAnyVisible = visibleNav.length > 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      className="z-10000"
      slotProps={{
        paper: { className: 'prefs-modal' },
      }}
      aria-label={t('prefs.title')}
    >
      <header className="prefs-header">
        <h2>{t('prefs.title')}</h2>
        <IconButton onClick={onClose} aria-label={t('common.close')} size="small">
          <Icon icon="material-symbols:close" aria-hidden />
        </IconButton>
      </header>
      <div className="prefs-body">
        <aside className="prefs-sidebar">
          <div className="prefs-search-wrap">
            <Icon
              icon="material-symbols:search"
              className="prefs-search-icon"
              aria-hidden
            />
            <input
              type="search"
              className="prefs-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('prefs.search.placeholder')}
              aria-label={t('prefs.search')}
            />
          </div>
          <ul className="prefs-nav" aria-label={t('prefs.nav')}>
            {visibleNav.map(item => {
              const isActive = section === item.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    className={`prefs-nav-item${isActive ? ' is-active' : ''}`}
                    onClick={() => setSection(item.id)}
                  >
                      <Icon icon={item.icon} width="1rem" height="1rem" aria-hidden />
                    <span>{t(item.labelKey)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
        <div className="prefs-content">
          <h3 className="prefs-content-title">{sectionTitle}</h3>

          {!hasAnyVisible ? (
            <p className="prefs-empty">{t('prefs.search.empty')}</p>
          ) : null}

          {hasAnyVisible && section === 'general' ? (
            <>
              {show('language') ? (
                <PrefGroup title={t('prefs.group.language')}>
                  <PrefRow
                    id="prefs-locale"
                    title={t('menu.language')}
                    description={t('prefs.desc.language')}
                  >
                    <TextField
                      id="prefs-locale"
                      select
                      value={locale}
                      onChange={e => setLocale(e.target.value as Locale)}
                      size="small"
                    >
                      <MenuItem value="en">{t('menu.lang.en')}</MenuItem>
                      <MenuItem value="zh">{t('menu.lang.zh')}</MenuItem>
                    </TextField>
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('startupBehavior') ? (
                <PrefGroup title={t('prefs.group.startup')}>
                  <PrefRow
                    id="prefs-startup"
                    title={t('prefs.startupBehavior')}
                    description={t('prefs.desc.startupBehavior')}
                  >
                    <TextField
                      id="prefs-startup"
                      select
                      size="small"
                      value={prefs.general.startupBehavior}
                      onChange={e =>
                        updateGeneral({ startupBehavior: e.target.value as StartupBehavior })
                      }
                    >
                      <MenuItem value="blank">{t('prefs.startupBehavior.blank')}</MenuItem>
                      <MenuItem value="restoreSession">
                        {t('prefs.startupBehavior.restoreSession')}
                      </MenuItem>
                      <MenuItem value="openRecent">
                        {t('prefs.startupBehavior.openRecent')}
                      </MenuItem>
                    </TextField>
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('recentFilesMax') ? (
                <PrefGroup title={t('prefs.group.files')}>
                  <PrefRow
                    id="prefs-recent-max"
                    title={t('prefs.recentFilesMax')}
                    description={t('prefs.desc.recentFilesMax')}
                  >
                    <TextField
                      id="prefs-recent-max"
                      type="number"
                      size="small"
                      value={prefs.general.recentFilesMax}
                      disabled={!desktopAvailable}
                      slotProps={{
                        htmlInput: {
                          min: RECENT_FILES_MAX_MIN,
                          max: RECENT_FILES_MAX_MAX,
                          step: 1,
                        },
                      }}
                      onChange={e => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n)) return
                        updateGeneral({ recentFilesMax: n })
                      }}
                      sx={{ width: '5.5rem' }}
                    />
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('statusBarVisible') || show('confirmCloseTabs') ? (
                <PrefGroup title={t('prefs.group.interface')}>
                  {show('statusBarVisible') ? (
                    <PrefRow
                      id="prefs-status-bar"
                      title={t('prefs.statusBarVisible')}
                      description={t('prefs.desc.statusBarVisible')}
                    >
                      <PrefToggle
                        id="prefs-status-bar"
                        checked={prefs.general.statusBarVisible}
                        onChange={checked => updateGeneral({ statusBarVisible: checked })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('confirmCloseTabs') ? (
                    <PrefRow
                      id="prefs-confirm-close"
                      title={t('prefs.confirmCloseTabs')}
                      description={t('prefs.desc.confirmCloseTabs')}
                    >
                      <PrefToggle
                        id="prefs-confirm-close"
                        checked={prefs.general.confirmCloseTabs}
                        onChange={checked => updateGeneral({ confirmCloseTabs: checked })}
                      />
                    </PrefRow>
                  ) : null}
                </PrefGroup>
              ) : null}
              {show('appUpdate') || show('autoUpdate') ? (
                <PrefGroup title={t('prefs.group.updates')}>
                  {show('appUpdate') ? (
                    <PrefRow
                      title={
                        appVersion
                          ? t('prefs.appUpdate', { version: appVersion })
                          : t('prefs.appUpdatePending')
                      }
                      description={formatUpdateStatus(t, updateStatus, appVersion)}
                      controlClassName="is-actions"
                    >
                      <Button
                        variant="outlined"
                        disabled={
                          !desktopAvailable ||
                          updateStatus.phase === 'checking' ||
                          updateStatus.phase === 'downloading'
                        }
                        onClick={() => {
                          if (!window.desktop) return
                          if (updateStatus.phase === 'ready') {
                            void window.desktop.installUpdate?.()
                            return
                          }
                          void window.desktop.checkForUpdates?.()
                        }}
                      >
                        {updateStatus.phase === 'ready'
                          ? t('prefs.relaunchApp')
                          : t('prefs.checkForUpdates')}
                      </Button>
                    </PrefRow>
                  ) : null}
                  {show('autoUpdate') ? (
                    <PrefRow
                      id="prefs-auto-update"
                      title={t('prefs.autoUpdate')}
                      description={t('prefs.desc.autoUpdate')}
                    >
                      <PrefToggle
                        id="prefs-auto-update"
                        checked={prefs.general.autoUpdate}
                        disabled={!desktopAvailable}
                        onChange={checked => updateGeneral({ autoUpdate: checked })}
                      />
                    </PrefRow>
                  ) : null}
                </PrefGroup>
              ) : null}
              {show('resetPrefs') ? (
                <PrefGroup title={t('prefs.group.defaults')}>
                  <PrefRow
                    title={t('prefs.reset')}
                    description={t('prefs.desc.reset')}
                    controlClassName="is-actions"
                  >
                    <Button variant="outlined" color="error" onClick={handleResetPreferences}>
                      {t('prefs.reset.action')}
                    </Button>
                  </PrefRow>
                </PrefGroup>
              ) : null}
            </>
          ) : null}

          {hasAnyVisible && section === 'appearance' ? (
            <>
              {show('uiTheme') ? (
                <PrefGroup title={t('prefs.group.interface')}>
                  <PrefRow
                    id="prefs-ui-theme"
                    title={t('prefs.uiTheme')}
                    description={t('prefs.desc.uiTheme')}
                  >
                    <TextField
                      id="prefs-ui-theme"
                      select
                      value={uiTheme}
                      onChange={e => setUiTheme(e.target.value as UiTheme)}
                      size="small"
                    >
                      {UI_THEMES.map(theme => (
                        <MenuItem key={theme} value={theme}>
                          {t(`prefs.uiTheme.${theme}` as MessageKey)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('modelTheme') ? (
                <PrefGroup title={t('prefs.group.model')}>
                  <PrefRow
                    id="prefs-theme"
                    title={t('menu.modelTheme')}
                    description={t('prefs.desc.modelTheme')}
                  >
                    <TextField
                      id="prefs-theme"
                      select
                      value={previewTheme}
                      onChange={e => setPreviewTheme(e.target.value as PreviewTheme)}
                      size="small"
                    >
                      <MenuItem value="simple">{t('menu.modelTheme.simple')}</MenuItem>
                      <MenuItem value="professional">
                        {t('menu.modelTheme.professional')}
                      </MenuItem>
                    </TextField>
                  </PrefRow>
                </PrefGroup>
              ) : null}
            </>
          ) : null}

          {hasAnyVisible && section === 'performance' ? (
            <>
              {show('msaa') ? (
                <PrefGroup title={t('prefs.group.rendering')}>
                  <PrefRow
                    id="prefs-msaa"
                    title={t('prefs.msaa')}
                    description={t('prefs.desc.msaa')}
                  >
                    <PrefToggle
                      id="prefs-msaa"
                      checked={prefs.performance.msaa}
                      onChange={checked => updatePerformance({ msaa: checked })}
                    />
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('maxTextureSize') ? (
                <PrefGroup title={t('prefs.group.memory')}>
                  <PrefRow
                    id="prefs-max-texture"
                    title={t('prefs.maxTextureSize')}
                    description={t('prefs.desc.maxTextureSize')}
                  >
                    <TextField
                      id="prefs-max-texture"
                      select
                      size="small"
                      value={prefs.performance.maxTextureSize}
                      onChange={e =>
                        updatePerformance({
                          maxTextureSize: Number(e.target.value) as MaxTextureSizeOption,
                        })
                      }
                    >
                      {MAX_TEXTURE_SIZE_OPTIONS.map(size => (
                        <MenuItem key={size} value={size}>
                          {size === 0
                            ? t('prefs.maxTextureSize.auto')
                            : t('prefs.maxTextureSize.px', { n: String(size) })}
                        </MenuItem>
                      ))}
                    </TextField>
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('autoReloadOnChange') ||
              show('cacheLocation') ||
              show('cachePath') ? (
                <PrefGroup title={t('prefs.group.files')}>
                  {show('autoReloadOnChange') ? (
                    <PrefRow
                      id="prefs-auto-reload"
                      title={t('prefs.autoReloadOnChange')}
                      description={t('prefs.desc.autoReloadOnChange')}
                    >
                      <PrefToggle
                        id="prefs-auto-reload"
                        checked={prefs.performance.autoReloadOnChange}
                        disabled={!desktopAvailable}
                        onChange={checked =>
                          updatePerformance({ autoReloadOnChange: checked })
                        }
                      />
                    </PrefRow>
                  ) : null}
                  {show('cacheLocation') ? (
                    <PrefRow
                      id="prefs-cache-location"
                      title={t('prefs.cacheLocation')}
                      description={t('prefs.desc.cacheLocation')}
                    >
                      <TextField
                        id="prefs-cache-location"
                        select
                        size="small"
                        disabled={!desktopAvailable}
                        value={prefs.performance.cacheDir ? 'folder' : 'system'}
                        onChange={e =>
                          void onCacheLocationChange(e.target.value as 'system' | 'folder')
                        }
                      >
                        <MenuItem value="system">{t('prefs.cacheLocation.system')}</MenuItem>
                        <MenuItem value="folder">{t('prefs.cacheLocation.folder')}</MenuItem>
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('cachePath') && prefs.performance.cacheDir ? (
                    <PrefRow
                      id="prefs-cache-path"
                      title={t('prefs.cachePath')}
                      description={t('prefs.desc.cachePath')}
                    >
                      <TextField
                        id="prefs-cache-path"
                        type="text"
                        size="small"
                        fullWidth
                        className="prefs-output-path"
                        value={prefs.performance.cacheDir}
                        slotProps={{
                          input: {
                            readOnly: true,
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton
                                  edge="end"
                                  size="small"
                                  disabled={!desktopAvailable}
                                  aria-label={t('prefs.cacheDir.choose')}
                                  title={t('prefs.cacheDir.choose')}
                                  onClick={() => {
                                    void chooseCacheDir().then(dir => {
                                      if (dir) updatePerformance({ cacheDir: dir })
                                    })
                                  }}
                                >
                                  <Icon icon="material-symbols:folder-open" aria-hidden />
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        aria-label={t('prefs.cachePath')}
                      />
                    </PrefRow>
                  ) : null}
                </PrefGroup>
              ) : null}
              {show('telemetry') ? (
                <PrefGroup title={t('prefs.group.privacy')}>
                  <PrefRow
                    id="prefs-telemetry"
                    title={t('prefs.telemetry')}
                    description={t('prefs.desc.telemetry')}
                  >
                    <PrefToggle
                      id="prefs-telemetry"
                      checked={prefs.performance.telemetryEnabled}
                      onChange={checked => updatePerformance({ telemetryEnabled: checked })}
                    />
                  </PrefRow>
                </PrefGroup>
              ) : null}
            </>
          ) : null}

          {hasAnyVisible && section === 'recording' ? (
            <>
              {show('recordingEnabled') ? (
                <PrefGroup title={t('prefs.group.feature')}>
                  <PrefRow
                    id="prefs-recording-enabled"
                    title={t('prefs.recording.enabled')}
                    description={t('prefs.desc.recordingEnabled')}
                  >
                    <PrefToggle
                      id="prefs-recording-enabled"
                      checked={prefs.recording.enabled}
                      onChange={checked => updateRecording({ enabled: checked })}
                    />
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('secPerRev') ||
              show('export') ||
              show('size') ||
              show('quality') ||
              show('outputLocation') ||
              show('outputPath') ? (
                <PrefGroup title={t('prefs.group.defaults')}>
                  {show('secPerRev') ? (
                    <PrefRow
                      id="prefs-sec"
                      title={t('record.secPerRev')}
                      description={t('prefs.desc.secPerRev')}
                    >
                      <TextField
                        id="prefs-sec"
                        type="number"
                        size="small"
                        slotProps={{
                          htmlInput: { min: 3, max: 60, step: 1 },
                        }}
                        value={prefs.recording.secondsPerRevolution}
                        onChange={e =>
                          updateRecording({
                            secondsPerRevolution:
                              Number(e.target.value) || DEFAULT_SECONDS_PER_REV,
                          })
                        }
                      />
                    </PrefRow>
                  ) : null}
                  {show('export') ? (
                    <PrefRow
                      id="prefs-format"
                      title={t('record.export')}
                      description={t('prefs.desc.export')}
                    >
                      <TextField
                        id="prefs-format"
                        select
                        size="small"
                        value={prefs.recording.recordingExportFormat}
                        onChange={e =>
                          updateRecording({
                            recordingExportFormat: e.target.value as RecordingExportFormat,
                          })
                        }
                      >
                        {RECORDING_EXPORT_FORMAT_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {t(`record.format.${opt.value}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('size') ? (
                    <PrefRow
                      id="prefs-size"
                      title={t('record.size')}
                      description={t('prefs.desc.size')}
                    >
                      <TextField
                        id="prefs-size"
                        select
                        size="small"
                        value={prefs.recording.recordingSizeId}
                        onChange={e => updateRecording({ recordingSizeId: e.target.value })}
                      >
                        {RECORDING_SIZE_PRESETS.map(preset => (
                          <MenuItem key={preset.id} value={preset.id}>
                            {t(`record.size.${preset.id}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('quality') ? (
                    <PrefRow
                      id="prefs-quality"
                      title={t('record.quality')}
                      description={t('prefs.desc.quality')}
                    >
                      <TextField
                        id="prefs-quality"
                        select
                        size="small"
                        value={prefs.recording.recordingQuality}
                        onChange={e =>
                          updateRecording({
                            recordingQuality: normalizeRecordingQuality(e.target.value),
                          })
                        }
                      >
                        {RECORDING_QUALITY_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {t(`record.quality.${opt.value}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('outputLocation') ? (
                    <PrefRow
                      id="prefs-output-location"
                      title={t('record.outputLocation')}
                      description={t('prefs.desc.outputLocation')}
                    >
                      <TextField
                        id="prefs-output-location"
                        select
                        size="small"
                        value={prefs.recording.outputDir ? 'folder' : 'ask'}
                        onChange={e => {
                          void onOutputLocationChange(e.target.value as 'ask' | 'folder')
                        }}
                      >
                        <MenuItem value="ask">{t('record.outputLocation.ask')}</MenuItem>
                        <MenuItem value="folder" disabled={!desktopAvailable}>
                          {t('record.outputLocation.folder')}
                        </MenuItem>
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('outputPath') && prefs.recording.outputDir ? (
                    <PrefRow
                      id="prefs-output-path"
                      title={t('record.outputPath')}
                      description={t('prefs.desc.outputPath')}
                      controlClassName="is-wide"
                    >
                      <TextField
                        id="prefs-output-path"
                        type="text"
                        size="small"
                        className="prefs-output-path"
                        slotProps={{
                          input: {
                            readOnly: true,
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton
                                  edge="end"
                                  size="small"
                                  disabled={!desktopAvailable}
                                  aria-label={t('record.outputDir.choose')}
                                  title={t('record.outputDir.choose')}
                                  onClick={() => {
                                    void chooseOutputDir().then(dir => {
                                      if (dir) updateRecording({ outputDir: dir })
                                    })
                                  }}
                                >
                                  <Icon icon="material-symbols:folder-open" aria-hidden />
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        value={prefs.recording.outputDir}
                        aria-label={t('record.outputPath')}
                      />
                    </PrefRow>
                  ) : null}
                </PrefGroup>
              ) : null}
            </>
          ) : null}

          {hasAnyVisible && section === 'lighting' ? (
            <>
              {show('lightingMode') || show('exposure') || show('envIntensity') ? (
                <PrefGroup title={t('prefs.group.defaults')}>
                  {show('lightingMode') ? (
                    <PrefRow
                      id="prefs-light-mode"
                      title={t('lighting.mode')}
                      description={t('prefs.desc.lightingMode')}
                    >
                      <TextField
                        id="prefs-light-mode"
                        select
                        size="small"
                        value={prefs.lighting.mode}
                        onChange={e =>
                          updateLighting({ mode: e.target.value as LightingMode })
                        }
                      >
                        {LIGHTING_MODE_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {t(`lighting.mode.${opt.value}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('exposure') ? (
                    <PrefRow
                      id="prefs-exposure"
                      title={t('lighting.exposure')}
                      description={t('prefs.desc.exposure')}
                    >
                      <TextField
                        id="prefs-exposure"
                        type="number"
                        size="small"
                        slotProps={{
                          htmlInput: { step: 0.05, min: 0.1, max: 3 },
                        }}
                        value={prefs.lighting.exposure}
                        onChange={e =>
                          updateLighting({
                            exposure: Number(e.target.value) || prefs.lighting.exposure,
                          })
                        }
                      />
                    </PrefRow>
                  ) : null}
                  {show('envIntensity') ? (
                    <PrefRow
                      id="prefs-env"
                      title={t('lighting.envIntensity')}
                      description={t('prefs.desc.envIntensity')}
                    >
                      <TextField
                        id="prefs-env"
                        type="number"
                        size="small"
                        disabled={prefs.lighting.mode !== 'studio'}
                        slotProps={{
                          htmlInput: { step: 0.05, min: 0, max: 3 },
                        }}
                        value={prefs.lighting.envIntensity}
                        onChange={e =>
                          updateLighting({
                            envIntensity:
                              Number(e.target.value) || prefs.lighting.envIntensity,
                          })
                        }
                      />
                    </PrefRow>
                  ) : null}
                </PrefGroup>
              ) : null}
            </>
          ) : null}

          {hasAnyVisible && section === 'about' ? (
            <>
              {show('aboutAuthor') || show('aboutRepository') ? (
                <PrefGroup title={t('prefs.group.project')}>
                  {show('aboutAuthor') ? (
                    <PrefRow
                      title={t('prefs.about.author')}
                      description={t('prefs.desc.about.author')}
                    >
                      <span className="prefs-about-value">{APP_AUTHOR}</span>
                    </PrefRow>
                  ) : null}
                  {show('aboutRepository') ? (
                    <PrefRow
                      title={t('prefs.about.repository')}
                      description={t('prefs.desc.about.repository')}
                      controlClassName="is-actions"
                    >
                      <Button
                        variant="outlined"
                        onClick={() => {
                          void openProjectRepository()
                        }}
                      >
                        {t('prefs.about.openRepo')}
                      </Button>
                    </PrefRow>
                  ) : null}
                </PrefGroup>
              ) : null}
              {show('aboutLicense') ? (
                <PrefGroup title={t('prefs.group.license')}>
                  <PrefRow
                    title={t('prefs.about.license')}
                    description={t('prefs.desc.about.license')}
                  >
                    <span className="prefs-about-value">{APP_LICENSE_SPDX}</span>
                  </PrefRow>
                </PrefGroup>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  )
}
