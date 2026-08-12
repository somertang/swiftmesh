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
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import {
  LIGHTING_MODE_OPTIONS,
  type LightingMode,
  type LightingSettings,
} from '../config/lightingDefaults'
import type {
  AtlasPackMode,
  JpegNoBgMode,
  RecordingExportFormat,
  RecordingImageFormat,
  RecordingMode,
  RecordingSequencePackage,
  UpdateStatus,
} from '../desktopTypes'
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
  JPEG_NO_BG_MODE_OPTIONS,
  normalizeRecordingQuality,
  RECORDING_EXPORT_FORMAT_OPTIONS,
  RECORDING_FPS_OPTIONS,
  RECORDING_IMAGE_FORMAT_OPTIONS,
  RECORDING_QUALITY_OPTIONS,
  ATLAS_PACK_MODE_OPTIONS,
  RECORDING_SEQUENCE_PACKAGE_OPTIONS,
  RECORDING_SIZE_PRESETS,
} from '../lib/recordingPresets'
import { ATLAS_MAX_EDGE_PRESETS, clampAtlasMaxEdge } from '../lib/atlasLayout'
import { pitchAnglesToText, parsePitchAnglesText } from '../lib/multiAxisManifest'
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
import { AtlasPreviewSummary } from './AtlasPreviewSummary'
import { FlattenColorField } from './FlattenColorField'
import { FrameCountControl } from './FrameCountControl'
import { LoadingButton } from './LoadingButton'
import { RecordingModeToggle } from './RecordingModeToggle'

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
  onUpdateCheckTip?: (tip: { severity: 'info' | 'error'; message: string }) => void
}

const NAV: { id: PreferencesSection; labelKey: MessageKey; icon: string }[] = [
  { id: 'general', labelKey: 'prefs.nav.general', icon: 'material-symbols:settings-outline' },
  { id: 'appearance', labelKey: 'prefs.nav.appearance', icon: 'material-symbols:palette-outline' },
  { id: 'performance', labelKey: 'prefs.nav.performance', icon: 'material-symbols:speed-outline' },
  { id: 'recording', labelKey: 'prefs.nav.recording', icon: 'material-symbols:videocam-outline' },
  { id: 'lighting', labelKey: 'prefs.nav.lighting', icon: 'material-symbols:wb-sunny-outline' },
  { id: 'about', labelKey: 'prefs.nav.about', icon: 'material-symbols:info-outline' },
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
  | 'autoNormalizeUnits'
  | 'autoReloadOnChange'
  | 'cacheLocation'
  | 'cachePath'
  | 'telemetry'
  | 'recordingEnabled'
  | 'recordingMode'
  | 'secPerRev'
  | 'export'
  | 'frameCount'
  | 'fps'
  | 'exportSequence'
  | 'exportAtlas'
  | 'exportBackground'
  | 'jpegNoBgMode'
  | 'imageFlattenColor'
  | 'videoFlattenColor'
  | 'atlasPackMode'
  | 'atlasMaxEdge'
  | 'multiAxis'
  | 'pitchAngles'
  | 'imageFormat'
  | 'imageQuality'
  | 'sequencePackage'
  | 'videoSize'
  | 'imageSize'
  | 'videoQuality'
  | 'imageCaptureQuality'
  | 'videoOutputLocation'
  | 'videoOutputPath'
  | 'imageOutputLocation'
  | 'imageOutputPath'
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
    section: 'about',
    titleKey: 'prefs.appUpdate',
    descKey: 'prefs.desc.appUpdate',
  },
  autoUpdate: {
    section: 'about',
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
  autoNormalizeUnits: {
    section: 'performance',
    titleKey: 'prefs.autoNormalizeUnits',
    descKey: 'prefs.desc.autoNormalizeUnits',
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
  recordingMode: {
    section: 'recording',
    titleKey: 'record.mode' as MessageKey,
    descKey: 'prefs.desc.recordingMode' as MessageKey,
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
  frameCount: {
    section: 'recording',
    titleKey: 'record.frameCount' as MessageKey,
    descKey: 'prefs.desc.frameCount' as MessageKey,
  },
  fps: {
    section: 'recording',
    titleKey: 'record.fps' as MessageKey,
    descKey: 'prefs.desc.fps' as MessageKey,
  },
  exportSequence: {
    section: 'recording',
    titleKey: 'record.exportSequence' as MessageKey,
    descKey: 'prefs.desc.exportSequence' as MessageKey,
  },
  exportAtlas: {
    section: 'recording',
    titleKey: 'record.exportAtlas' as MessageKey,
    descKey: 'prefs.desc.exportAtlas' as MessageKey,
  },
  exportBackground: {
    section: 'recording',
    titleKey: 'record.exportBackground' as MessageKey,
    descKey: 'prefs.desc.exportBackground' as MessageKey,
  },
  jpegNoBgMode: {
    section: 'recording',
    titleKey: 'record.jpegNoBgMode' as MessageKey,
    descKey: 'prefs.desc.jpegNoBgMode' as MessageKey,
  },
  imageFlattenColor: {
    section: 'recording',
    titleKey: 'record.flattenColor' as MessageKey,
    descKey: 'prefs.desc.imageFlattenColor' as MessageKey,
  },
  videoFlattenColor: {
    section: 'recording',
    titleKey: 'record.flattenColor' as MessageKey,
    descKey: 'prefs.desc.videoFlattenColor' as MessageKey,
  },
  atlasPackMode: {
    section: 'recording',
    titleKey: 'record.atlasPackMode' as MessageKey,
    descKey: 'prefs.desc.atlasPackMode' as MessageKey,
  },
  atlasMaxEdge: {
    section: 'recording',
    titleKey: 'record.atlasMaxEdge' as MessageKey,
    descKey: 'prefs.desc.atlasMaxEdge' as MessageKey,
  },
  multiAxis: {
    section: 'recording',
    titleKey: 'record.multiAxis' as MessageKey,
    descKey: 'prefs.desc.multiAxis' as MessageKey,
  },
  pitchAngles: {
    section: 'recording',
    titleKey: 'record.pitchAngles' as MessageKey,
    descKey: 'prefs.desc.pitchAngles' as MessageKey,
  },
  imageFormat: {
    section: 'recording',
    titleKey: 'record.imageFormat' as MessageKey,
    descKey: 'prefs.desc.imageFormat' as MessageKey,
  },
  imageQuality: {
    section: 'recording',
    titleKey: 'record.imageQuality' as MessageKey,
    descKey: 'prefs.desc.imageQuality' as MessageKey,
  },
  sequencePackage: {
    section: 'recording',
    titleKey: 'record.sequencePackage' as MessageKey,
    descKey: 'prefs.desc.sequencePackage' as MessageKey,
  },
  videoSize: {
    section: 'recording',
    titleKey: 'record.size',
    descKey: 'prefs.desc.videoSize' as MessageKey,
  },
  imageSize: {
    section: 'recording',
    titleKey: 'record.size',
    descKey: 'prefs.desc.imageSize' as MessageKey,
  },
  videoQuality: {
    section: 'recording',
    titleKey: 'record.quality',
    descKey: 'prefs.desc.videoQuality' as MessageKey,
  },
  imageCaptureQuality: {
    section: 'recording',
    titleKey: 'record.quality',
    descKey: 'prefs.desc.imageCaptureQuality' as MessageKey,
  },
  videoOutputLocation: {
    section: 'recording',
    titleKey: 'record.outputLocation',
    descKey: 'prefs.desc.videoOutputLocation' as MessageKey,
  },
  videoOutputPath: {
    section: 'recording',
    titleKey: 'record.outputPath',
    descKey: 'prefs.desc.videoOutputPath' as MessageKey,
  },
  imageOutputLocation: {
    section: 'recording',
    titleKey: 'record.outputLocation',
    descKey: 'prefs.desc.imageOutputLocation' as MessageKey,
  },
  imageOutputPath: {
    section: 'recording',
    titleKey: 'record.outputPath',
    descKey: 'prefs.desc.imageOutputPath' as MessageKey,
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
  currentVersion: string,
  macManualUpdate: boolean
): string {
  switch (status.phase) {
    case 'idle':
      return t(macManualUpdate ? 'prefs.desc.appUpdateMac' : 'prefs.desc.appUpdate')
    case 'dev':
      return t('update.devMessage')
    case 'checking':
      return t('prefs.updateStatus.checking')
    case 'upToDate':
      return t('update.upToDateMessage', { version: status.version || currentVersion })
    case 'available':
      return t(
        macManualUpdate ? 'prefs.updateStatus.availableMac' : 'prefs.updateStatus.available',
        { version: status.version }
      )
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
  onUpdateCheckTip,
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
  const [macManualUpdate, setMacManualUpdate] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [openingRepo, setOpeningRepo] = useState(false)
  const manualUpdateCheckRef = useRef(false)
  const onUpdateCheckTipRef = useRef(onUpdateCheckTip)
  onUpdateCheckTipRef.current = onUpdateCheckTip

  useEffect(() => {
    if (!open) return
    setSection(initialSection)
    setPrefs(readPreferences())
    setSearch('')
    manualUpdateCheckRef.current = false
    setInstallingUpdate(false)
    setOpeningRepo(false)
  }, [open, initialSection])

  useEffect(() => {
    if (!open || !window.desktop?.getWindowChrome) return
    let cancelled = false
    void window.desktop.getWindowChrome().then(chrome => {
      if (!cancelled) setMacManualUpdate(chrome.platform === 'darwin')
    })
    return () => {
      cancelled = true
    }
  }, [open])

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
    const unsub = window.desktop.onUpdateStatus?.(status => {
      setUpdateStatus(status)
      if (!manualUpdateCheckRef.current) return
      if (status.phase === 'checking') return
      manualUpdateCheckRef.current = false
      if (status.phase === 'upToDate') {
        onUpdateCheckTipRef.current?.({
          severity: 'info',
          message: t('update.upToDateMessage', { version: status.version }),
        })
      } else if (status.phase === 'dev') {
        onUpdateCheckTipRef.current?.({
          severity: 'info',
          message: t('update.devMessage'),
        })
      } else if (status.phase === 'error') {
        onUpdateCheckTipRef.current?.({
          severity: 'error',
          message: status.message || t('update.errorMessage'),
        })
      }
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [open, t])

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
    if (patch.autoUpdate !== undefined && window.desktop?.setAutoUpdateEnabled && !macManualUpdate) {
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
    if (window.desktop?.setAutoUpdateEnabled && !macManualUpdate) {
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
    setOpeningRepo(true)
    try {
      if (window.desktop?.openExternalUrl) {
        await window.desktop.openExternalUrl(APP_REPOSITORY_URL)
        return
      }
      window.open(APP_REPOSITORY_URL, '_blank', 'noopener,noreferrer')
    } finally {
      setOpeningRepo(false)
    }
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

  const onOutputLocationChange = async (
    which: 'video' | 'images',
    mode: 'ask' | 'folder'
  ) => {
    const key = which === 'video' ? 'videoOutputDir' : 'imageOutputDir'
    if (mode === 'ask') {
      updateRecording({ [key]: '' })
      return
    }
    if (prefs.recording[key]) return
    const dir = await chooseOutputDir()
    if (dir) updateRecording({ [key]: dir })
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
              {show('maxTextureSize') || show('autoNormalizeUnits') ? (
                <PrefGroup title={t('prefs.group.memory')}>
                  {show('maxTextureSize') ? (
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
                  ) : null}
                  {show('autoNormalizeUnits') ? (
                    <PrefRow
                      id="prefs-auto-normalize-units"
                      title={t('prefs.autoNormalizeUnits')}
                      description={t('prefs.desc.autoNormalizeUnits')}
                    >
                      <PrefToggle
                        id="prefs-auto-normalize-units"
                        checked={prefs.performance.autoNormalizeUnits}
                        onChange={checked => updatePerformance({ autoNormalizeUnits: checked })}
                      />
                    </PrefRow>
                  ) : null}
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
              {show('recordingMode') ? (
                <PrefGroup title={t('prefs.group.defaults')}>
                  <PrefRow
                    id="prefs-recording-mode"
                    title={t('record.mode' as MessageKey)}
                    description={t('prefs.desc.recordingMode' as MessageKey)}
                  >
                    <RecordingModeToggle
                      id="prefs-recording-mode"
                      value={prefs.recording.recordingMode}
                      onChange={(recordingMode: RecordingMode) =>
                        updateRecording({ recordingMode })
                      }
                    />
                  </PrefRow>
                </PrefGroup>
              ) : null}
              {show('export') ||
              show('secPerRev') ||
              show('fps') ||
              show('videoSize') ||
              show('videoQuality') ||
              show('videoFlattenColor') ||
              show('videoOutputLocation') ||
              show('videoOutputPath') ? (
                <PrefGroup title={t('prefs.group.videoDefaults' as MessageKey)}>
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
                        value={prefs.recording.videoExportFormat}
                        onChange={e =>
                          updateRecording({
                            videoExportFormat: e.target.value as RecordingExportFormat,
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
                  {show('fps') ? (
                    <PrefRow
                      id="prefs-fps"
                      title={t('record.fps' as MessageKey)}
                      description={t('prefs.desc.fps' as MessageKey)}
                    >
                      <TextField
                        id="prefs-fps"
                        select
                        size="small"
                        value={prefs.recording.recordingFps}
                        onChange={e =>
                          updateRecording({
                            recordingFps: Number(e.target.value) || 30,
                          })
                        }
                      >
                        {RECORDING_FPS_OPTIONS.map(n => (
                          <MenuItem key={n} value={n}>
                            {n}
                          </MenuItem>
                        ))}
                        {!(RECORDING_FPS_OPTIONS as readonly number[]).includes(
                          prefs.recording.recordingFps
                        ) ? (
                          <MenuItem value={prefs.recording.recordingFps}>
                            {prefs.recording.recordingFps}
                          </MenuItem>
                        ) : null}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('videoSize') ? (
                    <PrefRow
                      id="prefs-video-size"
                      title={t('record.size')}
                      description={t('prefs.desc.videoSize' as MessageKey)}
                    >
                      <TextField
                        id="prefs-video-size"
                        select
                        size="small"
                        value={prefs.recording.videoSizeId}
                        onChange={e => updateRecording({ videoSizeId: e.target.value })}
                      >
                        {RECORDING_SIZE_PRESETS.map(preset => (
                          <MenuItem key={preset.id} value={preset.id}>
                            {t(`record.size.${preset.id}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('videoSize') && prefs.recording.videoSizeId === 'custom' ? (
                    <PrefRow
                      id="prefs-video-custom-size"
                      title={t('record.size.custom')}
                      description={t('prefs.desc.customSize' as MessageKey)}
                    >
                      <div style={{ display: 'flex', gap: 8 }}>
                        <TextField
                          type="number"
                          size="small"
                          label={t('record.customWidth')}
                          slotProps={{ htmlInput: { min: 2, max: 8192, step: 2 } }}
                          value={prefs.recording.videoCustomWidth}
                          onChange={e =>
                            updateRecording({
                              videoCustomWidth: Math.max(
                                2,
                                Math.min(8192, Number(e.target.value) || 1920)
                              ),
                            })
                          }
                        />
                        <TextField
                          type="number"
                          size="small"
                          label={t('record.customHeight')}
                          slotProps={{ htmlInput: { min: 2, max: 8192, step: 2 } }}
                          value={prefs.recording.videoCustomHeight}
                          onChange={e =>
                            updateRecording({
                              videoCustomHeight: Math.max(
                                2,
                                Math.min(8192, Number(e.target.value) || 1080)
                              ),
                            })
                          }
                        />
                      </div>
                    </PrefRow>
                  ) : null}
                  {show('videoFlattenColor') && !prefs.recording.exportBackground ? (
                    <PrefRow
                      id="prefs-video-flatten-color"
                      title={t('record.flattenColor' as MessageKey)}
                      description={t('prefs.desc.videoFlattenColor' as MessageKey)}
                    >
                      <FlattenColorField
                        id="prefs-video-flatten-color"
                        value={prefs.recording.videoFlattenColor}
                        ariaLabel={t('record.flattenColor' as MessageKey)}
                        onChange={videoFlattenColor => updateRecording({ videoFlattenColor })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('videoQuality') ? (
                    <PrefRow
                      id="prefs-video-quality"
                      title={t('record.quality')}
                      description={t('prefs.desc.videoQuality' as MessageKey)}
                    >
                      <TextField
                        id="prefs-video-quality"
                        select
                        size="small"
                        value={normalizeRecordingQuality(prefs.recording.videoQuality)}
                        onChange={e =>
                          updateRecording({
                            videoQuality: normalizeRecordingQuality(e.target.value),
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
                  {show('videoOutputLocation') ? (
                    <PrefRow
                      id="prefs-video-output-location"
                      title={t('record.outputLocation')}
                      description={t('prefs.desc.videoOutputLocation' as MessageKey)}
                    >
                      <TextField
                        id="prefs-video-output-location"
                        select
                        size="small"
                        value={prefs.recording.videoOutputDir ? 'folder' : 'ask'}
                        onChange={e => {
                          void onOutputLocationChange(
                            'video',
                            e.target.value as 'ask' | 'folder'
                          )
                        }}
                      >
                        <MenuItem value="ask">{t('record.outputLocation.ask')}</MenuItem>
                        <MenuItem value="folder" disabled={!desktopAvailable}>
                          {t('record.outputLocation.folder')}
                        </MenuItem>
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('videoOutputPath') && prefs.recording.videoOutputDir ? (
                    <PrefRow
                      id="prefs-video-output-path"
                      title={t('record.outputPath')}
                      description={t('prefs.desc.videoOutputPath' as MessageKey)}
                      controlClassName="is-wide"
                    >
                      <TextField
                        id="prefs-video-output-path"
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
                                      if (dir) updateRecording({ videoOutputDir: dir })
                                    })
                                  }}
                                >
                                  <Icon icon="material-symbols:folder-open" aria-hidden />
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        value={prefs.recording.videoOutputDir}
                        aria-label={t('record.outputPath')}
                      />
                    </PrefRow>
                  ) : null}
                </PrefGroup>
              ) : null}
              {show('frameCount') ||
              show('exportSequence') ||
              show('exportAtlas') ||
              show('exportBackground') ||
              show('jpegNoBgMode') ||
              show('imageFlattenColor') ||
              show('atlasPackMode') ||
              show('atlasMaxEdge') ||
              show('multiAxis') ||
              show('pitchAngles') ||
              show('imageFormat') ||
              show('imageQuality') ||
              show('sequencePackage') ||
              show('imageSize') ||
              show('imageCaptureQuality') ||
              show('imageOutputLocation') ||
              show('imageOutputPath') ? (
                <PrefGroup title={t('prefs.group.imageDefaults' as MessageKey)}>
                  {show('frameCount') ? (
                    <PrefRow
                      id="prefs-frame-count"
                      title={t('record.frameCount' as MessageKey)}
                      description={t('prefs.desc.frameCount' as MessageKey)}
                    >
                      <FrameCountControl
                        id="prefs-frame-count"
                        value={prefs.recording.frameCount}
                        ariaLabel={t('record.frameCount' as MessageKey)}
                        onChange={frameCount => updateRecording({ frameCount })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('exportSequence') ? (
                    <PrefRow
                      id="prefs-export-sequence"
                      title={t('record.exportSequence' as MessageKey)}
                      description={t('prefs.desc.exportSequence' as MessageKey)}
                    >
                      <PrefToggle
                        id="prefs-export-sequence"
                        checked={prefs.recording.exportSequence}
                        onChange={exportSequence => updateRecording({ exportSequence })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('exportAtlas') ? (
                    <PrefRow
                      id="prefs-export-atlas"
                      title={t('record.exportAtlas' as MessageKey)}
                      description={t('prefs.desc.exportAtlas' as MessageKey)}
                    >
                      <PrefToggle
                        id="prefs-export-atlas"
                        checked={prefs.recording.exportAtlas}
                        onChange={exportAtlas => updateRecording({ exportAtlas })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('exportBackground') ? (
                    <PrefRow
                      id="prefs-export-background"
                      title={t('record.exportBackground' as MessageKey)}
                      description={t('prefs.desc.exportBackground' as MessageKey)}
                    >
                      <PrefToggle
                        id="prefs-export-background"
                        checked={prefs.recording.exportBackground}
                        onChange={exportBackground => updateRecording({ exportBackground })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('jpegNoBgMode') &&
                  !prefs.recording.exportBackground &&
                  prefs.recording.imageFormat === 'jpeg' ? (
                    <PrefRow
                      id="prefs-jpeg-nobg-mode"
                      title={t('record.jpegNoBgMode' as MessageKey)}
                      description={t('prefs.desc.jpegNoBgMode' as MessageKey)}
                    >
                      <TextField
                        id="prefs-jpeg-nobg-mode"
                        select
                        size="small"
                        value={prefs.recording.jpegNoBgMode}
                        onChange={e =>
                          updateRecording({ jpegNoBgMode: e.target.value as JpegNoBgMode })
                        }
                      >
                        {JPEG_NO_BG_MODE_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {t(`record.jpegNoBgMode.${opt.value}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('imageFlattenColor') &&
                  !prefs.recording.exportBackground &&
                  prefs.recording.imageFormat === 'jpeg' ? (
                    <PrefRow
                      id="prefs-image-flatten-color"
                      title={t('record.flattenColor' as MessageKey)}
                      description={t('prefs.desc.imageFlattenColor' as MessageKey)}
                    >
                      <FlattenColorField
                        id="prefs-image-flatten-color"
                        value={prefs.recording.imageFlattenColor}
                        ariaLabel={t('record.flattenColor' as MessageKey)}
                        onChange={imageFlattenColor => updateRecording({ imageFlattenColor })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('atlasPackMode') && prefs.recording.exportAtlas ? (
                    <PrefRow
                      id="prefs-atlas-pack-mode"
                      title={t('record.atlasPackMode' as MessageKey)}
                      description={t('prefs.desc.atlasPackMode' as MessageKey)}
                    >
                      <TextField
                        id="prefs-atlas-pack-mode"
                        select
                        size="small"
                        value={prefs.recording.atlasPackMode}
                        onChange={e =>
                          updateRecording({
                            atlasPackMode: e.target.value as AtlasPackMode,
                          })
                        }
                      >
                        {ATLAS_PACK_MODE_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {t(`record.atlasPackMode.${opt.value}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('atlasMaxEdge') && prefs.recording.exportAtlas ? (
                    <PrefRow
                      id="prefs-atlas-max-edge"
                      title={t('record.atlasMaxEdge' as MessageKey)}
                      description={t('prefs.desc.atlasMaxEdge' as MessageKey)}
                    >
                      <TextField
                        id="prefs-atlas-max-edge"
                        select
                        size="small"
                        value={
                          (ATLAS_MAX_EDGE_PRESETS as readonly number[]).includes(
                            prefs.recording.atlasMaxEdge
                          )
                            ? String(prefs.recording.atlasMaxEdge)
                            : 'custom'
                        }
                        onChange={e => {
                          const v = e.target.value
                          if (v === 'custom') {
                            updateRecording({
                              atlasMaxEdge: clampAtlasMaxEdge(
                                (ATLAS_MAX_EDGE_PRESETS as readonly number[]).includes(
                                  prefs.recording.atlasMaxEdge
                                )
                                  ? 3072
                                  : prefs.recording.atlasMaxEdge
                              ),
                            })
                            return
                          }
                          updateRecording({ atlasMaxEdge: clampAtlasMaxEdge(Number(v)) })
                        }}
                      >
                        {ATLAS_MAX_EDGE_PRESETS.map(edge => (
                          <MenuItem key={edge} value={String(edge)}>
                            {edge}
                          </MenuItem>
                        ))}
                        <MenuItem value="custom">{t('record.atlasMaxEdge.custom')}</MenuItem>
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('atlasMaxEdge') &&
                  prefs.recording.exportAtlas &&
                  !(ATLAS_MAX_EDGE_PRESETS as readonly number[]).includes(
                    prefs.recording.atlasMaxEdge
                  ) ? (
                    <PrefRow
                      id="prefs-atlas-max-edge-custom"
                      title={t('record.atlasMaxEdge' as MessageKey)}
                      description={t('prefs.desc.atlasMaxEdge' as MessageKey)}
                    >
                      <TextField
                        id="prefs-atlas-max-edge-custom"
                        type="number"
                        size="small"
                        slotProps={{ htmlInput: { min: 256, max: 16384, step: 1 } }}
                        value={prefs.recording.atlasMaxEdge}
                        onChange={e =>
                          updateRecording({
                            atlasMaxEdge: clampAtlasMaxEdge(Number(e.target.value)),
                          })
                        }
                      />
                    </PrefRow>
                  ) : null}
                  {show('multiAxis') ? (
                    <PrefRow
                      id="prefs-multi-axis"
                      title={t('record.multiAxis' as MessageKey)}
                      description={t('prefs.desc.multiAxis' as MessageKey)}
                    >
                      <PrefToggle
                        id="prefs-multi-axis"
                        checked={prefs.recording.multiAxisEnabled}
                        onChange={multiAxisEnabled => updateRecording({ multiAxisEnabled })}
                      />
                    </PrefRow>
                  ) : null}
                  {show('pitchAngles') && prefs.recording.multiAxisEnabled ? (
                    <PrefRow
                      id="prefs-pitch-angles"
                      title={t('record.pitchAngles' as MessageKey)}
                      description={t('prefs.desc.pitchAngles' as MessageKey)}
                      controlClassName="is-wide"
                    >
                      <TextField
                        id="prefs-pitch-angles"
                        size="small"
                        value={pitchAnglesToText(prefs.recording.pitchAngles)}
                        onChange={e => {
                          const parsed = parsePitchAnglesText(e.target.value)
                          if (parsed) updateRecording({ pitchAngles: parsed })
                        }}
                        placeholder="-15, 0, 25, 50, 75"
                      />
                    </PrefRow>
                  ) : null}
                  {show('imageFormat') ? (
                    <PrefRow
                      id="prefs-image-format"
                      title={t('record.imageFormat' as MessageKey)}
                      description={t('prefs.desc.imageFormat' as MessageKey)}
                    >
                      <TextField
                        id="prefs-image-format"
                        select
                        size="small"
                        value={prefs.recording.imageFormat}
                        onChange={e =>
                          updateRecording({
                            imageFormat: e.target.value as RecordingImageFormat,
                          })
                        }
                      >
                        {RECORDING_IMAGE_FORMAT_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {t(`record.imageFormat.${opt.value}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('imageQuality') && prefs.recording.imageFormat !== 'png' ? (
                    <PrefRow
                      id="prefs-image-quality"
                      title={t('record.imageQuality' as MessageKey)}
                      description={t('prefs.desc.imageQuality' as MessageKey)}
                    >
                      <TextField
                        id="prefs-image-quality"
                        type="number"
                        size="small"
                        slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
                        value={prefs.recording.imageQuality}
                        onChange={e =>
                          updateRecording({
                            imageQuality: Math.max(
                              1,
                              Math.min(100, Number(e.target.value) || 92)
                            ),
                          })
                        }
                      />
                    </PrefRow>
                  ) : null}
                  {show('sequencePackage') && prefs.recording.exportSequence ? (
                    <PrefRow
                      id="prefs-sequence-package"
                      title={t('record.sequencePackage' as MessageKey)}
                      description={t('prefs.desc.sequencePackage' as MessageKey)}
                    >
                      <TextField
                        id="prefs-sequence-package"
                        select
                        size="small"
                        value={prefs.recording.sequencePackage}
                        onChange={e =>
                          updateRecording({
                            sequencePackage: e.target.value as RecordingSequencePackage,
                          })
                        }
                      >
                        {RECORDING_SEQUENCE_PACKAGE_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {t(`record.sequencePackage.${opt.value}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('imageSize') ? (
                    <PrefRow
                      id="prefs-image-size"
                      title={t('record.size')}
                      description={t('prefs.desc.imageSize' as MessageKey)}
                    >
                      <TextField
                        id="prefs-image-size"
                        select
                        size="small"
                        value={prefs.recording.imageSizeId}
                        onChange={e => updateRecording({ imageSizeId: e.target.value })}
                      >
                        {RECORDING_SIZE_PRESETS.map(preset => (
                          <MenuItem key={preset.id} value={preset.id}>
                            {t(`record.size.${preset.id}` as MessageKey)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('imageSize') && prefs.recording.imageSizeId === 'custom' ? (
                    <PrefRow
                      id="prefs-image-custom-size"
                      title={t('record.size.custom')}
                      description={t('prefs.desc.customSize' as MessageKey)}
                    >
                      <div style={{ display: 'flex', gap: 8 }}>
                        <TextField
                          type="number"
                          size="small"
                          label={t('record.customWidth')}
                          slotProps={{ htmlInput: { min: 2, max: 8192, step: 2 } }}
                          value={prefs.recording.imageCustomWidth}
                          onChange={e =>
                            updateRecording({
                              imageCustomWidth: Math.max(
                                2,
                                Math.min(8192, Number(e.target.value) || 1280)
                              ),
                            })
                          }
                        />
                        <TextField
                          type="number"
                          size="small"
                          label={t('record.customHeight')}
                          slotProps={{ htmlInput: { min: 2, max: 8192, step: 2 } }}
                          value={prefs.recording.imageCustomHeight}
                          onChange={e =>
                            updateRecording({
                              imageCustomHeight: Math.max(
                                2,
                                Math.min(8192, Number(e.target.value) || 720)
                              ),
                            })
                          }
                        />
                      </div>
                    </PrefRow>
                  ) : null}
                  {show('imageSize') && prefs.recording.exportAtlas ? (
                    <PrefRow
                      id="prefs-atlas-preview"
                      title={t('record.atlasPreview.label')}
                      description={t('prefs.desc.atlasPackMode' as MessageKey)}
                      controlClassName="is-wide"
                    >
                      <AtlasPreviewSummary
                        tileW={
                          prefs.recording.imageSizeId === 'custom'
                            ? prefs.recording.imageCustomWidth
                            : RECORDING_SIZE_PRESETS.find(p => p.id === prefs.recording.imageSizeId)
                                ?.width ?? 1280
                        }
                        tileH={
                          prefs.recording.imageSizeId === 'custom'
                            ? prefs.recording.imageCustomHeight
                            : RECORDING_SIZE_PRESETS.find(p => p.id === prefs.recording.imageSizeId)
                                ?.height ?? 720
                        }
                        frameCount={prefs.recording.frameCount}
                        packMode={prefs.recording.atlasPackMode}
                        maxEdge={prefs.recording.atlasMaxEdge}
                        pitchCount={
                          prefs.recording.multiAxisEnabled
                            ? prefs.recording.pitchAngles.length
                            : 1
                        }
                      />
                    </PrefRow>
                  ) : null}
                  {show('imageCaptureQuality') ? (
                    <PrefRow
                      id="prefs-image-capture-quality"
                      title={t('record.quality')}
                      description={t('prefs.desc.imageCaptureQuality' as MessageKey)}
                    >
                      <TextField
                        id="prefs-image-capture-quality"
                        select
                        size="small"
                        value={normalizeRecordingQuality(prefs.recording.imageCaptureQuality)}
                        onChange={e =>
                          updateRecording({
                            imageCaptureQuality: normalizeRecordingQuality(e.target.value),
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
                  {show('imageOutputLocation') ? (
                    <PrefRow
                      id="prefs-image-output-location"
                      title={t('record.outputLocation')}
                      description={t('prefs.desc.imageOutputLocation' as MessageKey)}
                    >
                      <TextField
                        id="prefs-image-output-location"
                        select
                        size="small"
                        value={prefs.recording.imageOutputDir ? 'folder' : 'ask'}
                        onChange={e => {
                          void onOutputLocationChange(
                            'images',
                            e.target.value as 'ask' | 'folder'
                          )
                        }}
                      >
                        <MenuItem value="ask">{t('record.outputLocation.ask')}</MenuItem>
                        <MenuItem value="folder" disabled={!desktopAvailable}>
                          {t('record.outputLocation.folder')}
                        </MenuItem>
                      </TextField>
                    </PrefRow>
                  ) : null}
                  {show('imageOutputPath') && prefs.recording.imageOutputDir ? (
                    <PrefRow
                      id="prefs-image-output-path"
                      title={t('record.outputPath')}
                      description={t('prefs.desc.imageOutputPath' as MessageKey)}
                      controlClassName="is-wide"
                    >
                      <TextField
                        id="prefs-image-output-path"
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
                                      if (dir) updateRecording({ imageOutputDir: dir })
                                    })
                                  }}
                                >
                                  <Icon icon="material-symbols:folder-open" aria-hidden />
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        value={prefs.recording.imageOutputDir}
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
              {show('appUpdate') || (show('autoUpdate') && !macManualUpdate) ? (
                <PrefGroup title={t('prefs.group.updates')}>
                  {show('appUpdate') ? (
                    <PrefRow
                      title={
                        appVersion
                          ? t('prefs.appUpdate', { version: appVersion })
                          : t('prefs.appUpdatePending')
                      }
                      description={formatUpdateStatus(t, updateStatus, appVersion, macManualUpdate)}
                      controlClassName="is-actions"
                    >
                      <LoadingButton
                        variant="outlined"
                        loading={
                          updateStatus.phase === 'checking' ||
                          (!macManualUpdate && updateStatus.phase === 'downloading') ||
                          (!macManualUpdate && installingUpdate)
                        }
                        loadingText={
                          installingUpdate
                            ? t('prefs.relaunchingApp')
                            : updateStatus.phase === 'downloading'
                              ? t('prefs.updateStatus.downloading', {
                                  percent: Math.round(
                                    updateStatus.phase === 'downloading'
                                      ? updateStatus.percent
                                      : 0
                                  ),
                                })
                              : t('prefs.updateStatus.checking')
                        }
                        disabled={!desktopAvailable}
                        onClick={() => {
                          if (!window.desktop) return
                          if (!macManualUpdate && updateStatus.phase === 'ready') {
                            setInstallingUpdate(true)
                            void window.desktop.installUpdate?.()
                            return
                          }
                          manualUpdateCheckRef.current = true
                          void window.desktop.checkForUpdates?.()
                        }}
                      >
                        {!macManualUpdate && updateStatus.phase === 'ready'
                          ? t('prefs.relaunchApp')
                          : t('prefs.checkForUpdates')}
                      </LoadingButton>
                    </PrefRow>
                  ) : null}
                  {show('autoUpdate') && !macManualUpdate ? (
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
                      <LoadingButton
                        variant="outlined"
                        loading={openingRepo}
                        loadingText={t('prefs.about.openingRepo')}
                        onClick={() => {
                          void openProjectRepository()
                        }}
                      >
                        {t('prefs.about.openRepo')}
                      </LoadingButton>
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
