import { useEffect, useMemo, useState, type ChangeEvent, type FC } from 'react'
import {
  LIGHTING_MODE_OPTIONS,
  type LightingMode,
  type LightingSettings,
} from '../config/lightingDefaults'
import type { RecordingExportFormat } from '../desktopTypes'
import { Icon } from '../icons'
import { useLocale, useT, type MessageKey } from '../i18n'
import type { Locale } from '../i18n/messages'
import {
  patchPreferences,
  readPreferences,
  type AppPreferences,
  type RecordingPreferences,
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
import { useUiTheme } from '../uiTheme'
import { UI_THEMES, type UiTheme } from '../lib/uiTheme'

export type PreferencesSection = 'general' | 'recording' | 'lighting'

type Props = {
  open: boolean
  onClose: () => void
  initialSection?: PreferencesSection
}

const NAV: { id: PreferencesSection; labelKey: MessageKey }[] = [
  { id: 'general', labelKey: 'prefs.nav.general' },
  { id: 'recording', labelKey: 'prefs.nav.recording' },
  { id: 'lighting', labelKey: 'prefs.nav.lighting' },
]

function PrefField({
  id,
  label,
  children,
}: {
  id?: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-center sm:gap-3">
      {id ? (
        <label className="w-40 shrink-0 text-sm opacity-80" htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className="w-40 shrink-0 text-sm opacity-80">{label}</span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export const PreferencesModal: FC<Props> = ({ open, onClose, initialSection = 'general' }) => {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const { previewTheme, setPreviewTheme } = usePreviewTheme()
  const { uiTheme, setUiTheme } = useUiTheme()
  const [section, setSection] = useState<PreferencesSection>(initialSection)
  const [prefs, setPrefs] = useState<AppPreferences>(() => readPreferences())

  useEffect(() => {
    if (!open) return
    setSection(initialSection)
    setPrefs(readPreferences())
  }, [open, initialSection])

  const desktopAvailable = Boolean(window.desktop)

  const updateRecording = (patch: Partial<RecordingPreferences>) => {
    setPrefs(patchPreferences({ recording: patch }))
  }

  const updateLighting = (patch: Partial<LightingSettings>) => {
    setPrefs(patchPreferences({ lighting: patch }))
  }

  const sectionTitle = useMemo(() => {
    const item = NAV.find(n => n.id === section)
    return item ? t(item.labelKey) : ''
  }, [section, t])

  if (!open) return null

  return (
    <div className="modal modal-open z-10000 bg-black/50" role="presentation">
      <div
        className="modal-box flex h-[min(560px,90vh)] max-h-[min(560px,90vh)] w-11/12 max-w-3xl flex-col gap-0 p-0"
        role="dialog"
        aria-modal="true"
        aria-label={t('prefs.title')}
        onClick={event => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-base-300 px-4 py-3">
          <h2 className="text-lg font-semibold">{t('prefs.title')}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Icon icon="material-symbols:close" aria-hidden />
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <ul className="menu menu-sm w-40 shrink-0 border-r border-base-300 bg-base-200 p-2" aria-label={t('prefs.nav')}>
            {NAV.map(item => {
              const isActive = section === item.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    className={
                      isActive
                        ? 'rounded-r-lg border-l-2 border-primary bg-primary/15 font-medium text-base-content'
                        : 'border-l-2 border-transparent'
                    }
                    onClick={() => setSection(item.id)}
                  >
                    {t(item.labelKey)}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <h3 className="mb-3 text-sm font-semibold opacity-70">{sectionTitle}</h3>

            {section === 'general' ? (
              <>
                <PrefField id="prefs-locale" label={t('menu.language')}>
                  <select
                    id="prefs-locale"
                    className="select select-bordered select-sm w-full"
                    value={locale}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setLocale(e.target.value as Locale)
                    }
                  >
                    <option value="en">{t('menu.lang.en')}</option>
                    <option value="zh">{t('menu.lang.zh')}</option>
                  </select>
                </PrefField>
                <PrefField id="prefs-ui-theme" label={t('prefs.uiTheme')}>
                  <select
                    id="prefs-ui-theme"
                    className="select select-bordered select-sm w-full"
                    value={uiTheme}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setUiTheme(e.target.value as UiTheme)
                    }
                  >
                    {UI_THEMES.map(theme => (
                      <option key={theme} value={theme}>
                        {t(`prefs.uiTheme.${theme}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </PrefField>
                <PrefField id="prefs-theme" label={t('menu.modelTheme')}>
                  <select
                    id="prefs-theme"
                    className="select select-bordered select-sm w-full"
                    value={previewTheme}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setPreviewTheme(e.target.value as PreviewTheme)
                    }
                  >
                    <option value="simple">{t('menu.modelTheme.simple')}</option>
                    <option value="professional">{t('menu.modelTheme.professional')}</option>
                  </select>
                </PrefField>
                <div className="mt-4 rounded-box border border-base-300 bg-base-200/50 p-3">
                  <div className="mb-2 text-sm font-medium">{t('menu.setDefaultApp')}</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!desktopAvailable}
                      onClick={() => void window.desktop?.openDefaultAppsSettings?.()}
                    >
                      {t('menu.setDefaultAppOpenSettings')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!desktopAvailable}
                      onClick={() => void window.desktop?.openDefaultAppsSettings?.('glb')}
                    >
                      {t('menu.setDefaultAppForExt', { ext: 'glb' })}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!desktopAvailable}
                      onClick={() => void window.desktop?.openDefaultAppsSettings?.('gltf')}
                    >
                      {t('menu.setDefaultAppForExt', { ext: 'gltf' })}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!desktopAvailable}
                      onClick={() => void window.desktop?.openDefaultAppsSettings?.('obj')}
                    >
                      {t('menu.setDefaultAppForExt', { ext: 'obj' })}
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {section === 'recording' ? (
              <>
                <PrefField id="prefs-sec" label={t('record.secPerRev')}>
                  <input
                    id="prefs-sec"
                    className="input input-bordered input-sm w-full"
                    type="number"
                    min={3}
                    max={60}
                    step={1}
                    value={prefs.recording.secondsPerRevolution}
                    onChange={e =>
                      updateRecording({
                        secondsPerRevolution: Number(e.target.value) || DEFAULT_SECONDS_PER_REV,
                      })
                    }
                  />
                </PrefField>
                <PrefField id="prefs-format" label={t('record.export')}>
                  <select
                    id="prefs-format"
                    className="select select-bordered select-sm w-full"
                    value={prefs.recording.recordingExportFormat}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      updateRecording({
                        recordingExportFormat: e.target.value as RecordingExportFormat,
                      })
                    }
                  >
                    {RECORDING_EXPORT_FORMAT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {t(`record.format.${opt.value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </PrefField>
                <PrefField id="prefs-size" label={t('record.size')}>
                  <select
                    id="prefs-size"
                    className="select select-bordered select-sm w-full"
                    value={prefs.recording.recordingSizeId}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      updateRecording({ recordingSizeId: e.target.value })
                    }
                  >
                    {RECORDING_SIZE_PRESETS.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {t(`record.size.${preset.id}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </PrefField>
                <PrefField id="prefs-quality" label={t('record.quality')}>
                  <select
                    id="prefs-quality"
                    className="select select-bordered select-sm w-full"
                    value={prefs.recording.recordingQuality}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      updateRecording({
                        recordingQuality: normalizeRecordingQuality(e.target.value),
                      })
                    }
                  >
                    {RECORDING_QUALITY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {t(`record.quality.${opt.value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </PrefField>
                <PrefField label={t('record.outputDir')}>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      readOnly
                      value={prefs.recording.outputDir}
                      placeholder={t('record.outputDir.empty')}
                      aria-label={t('record.outputDir')}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!desktopAvailable}
                        onClick={() => {
                          void window.desktop?.chooseRecordingOutputDir?.().then(dir => {
                            if (dir) setPrefs(patchPreferences({ recording: { outputDir: dir } }))
                          })
                        }}
                      >
                        {t('record.outputDir.choose')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={!prefs.recording.outputDir}
                        onClick={() =>
                          setPrefs(patchPreferences({ recording: { outputDir: '' } }))
                        }
                      >
                        {t('record.outputDir.clear')}
                      </button>
                    </div>
                    <p className="text-xs opacity-60">{t('record.outputDir.hint')}</p>
                  </div>
                </PrefField>
                <p className="mt-3 text-xs opacity-60">{t('prefs.recording.hint')}</p>
              </>
            ) : null}

            {section === 'lighting' ? (
              <>
                <PrefField id="prefs-light-mode" label={t('lighting.mode')}>
                  <select
                    id="prefs-light-mode"
                    className="select select-bordered select-sm w-full"
                    value={prefs.lighting.mode}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      updateLighting({ mode: e.target.value as LightingMode })
                    }
                  >
                    {LIGHTING_MODE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {t(`lighting.mode.${opt.value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </PrefField>
                <PrefField id="prefs-exposure" label={t('lighting.exposure')}>
                  <input
                    id="prefs-exposure"
                    className="input input-bordered input-sm w-full"
                    type="number"
                    step={0.05}
                    min={0.1}
                    max={3}
                    value={prefs.lighting.exposure}
                    onChange={e =>
                      updateLighting({ exposure: Number(e.target.value) || prefs.lighting.exposure })
                    }
                  />
                </PrefField>
                <PrefField id="prefs-env" label={t('lighting.envIntensity')}>
                  <input
                    id="prefs-env"
                    className="input input-bordered input-sm w-full"
                    type="number"
                    step={0.05}
                    min={0}
                    max={3}
                    value={prefs.lighting.envIntensity}
                    disabled={prefs.lighting.mode !== 'studio'}
                    onChange={e =>
                      updateLighting({
                        envIntensity: Number(e.target.value) || prefs.lighting.envIntensity,
                      })
                    }
                  />
                </PrefField>
                <p className="mt-3 text-xs opacity-60">{t('prefs.lighting.hint')}</p>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="modal-backdrop bg-transparent!"
        aria-label={t('common.close')}
        onClick={onClose}
      />
    </div>
  )
}
