import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useState, type FC } from 'react'
import { DEFAULT_CAMERA, type CameraSettings } from '../config/cameraDefaults'
import {
  DEFAULT_LIGHTING,
  LIGHTING_MODE_OPTIONS,
  type LightingMode,
  type LightingSettings,
} from '../config/lightingDefaults'
import { Icon } from '../icons'
import { useT, type MessageKey } from '../i18n'
import type { ShadingMode } from '../lib/shadingMode'
import { CameraProjectionIcon } from './CameraProjectionIcon'
import { ShadingToolbar } from './ShadingToolbar'

type PanelId = 'lighting' | 'camera' | null

type Props = {
  lighting: LightingSettings
  camera: CameraSettings
  shadingMode: ShadingMode
  disabled?: boolean
  onShadingModeChange: (mode: ShadingMode) => void
  onLightingChange: (patch: Partial<LightingSettings>) => void
  onLightingReset: () => void
  onCameraChange: <K extends keyof CameraSettings>(key: K, value: CameraSettings[K]) => void
  onCameraReset: () => void
}

function FieldRow({
  id,
  label,
  children,
}: {
  id?: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="field-row">
      {id ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className="field-label">{label}</span>
      )}
      <div className="field-control">{children}</div>
    </div>
  )
}

function NumInput({
  id,
  label,
  value,
  disabled,
  step = 0.1,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  disabled?: boolean
  step?: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <FieldRow id={id} label={label}>
      <TextField
        id={id}
        type="number"
        size="small"
        disabled={disabled}
        slotProps={{ htmlInput: { step, min, max } }}
        value={value}
        onChange={e => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) ? n : value)
        }}
      />
    </FieldRow>
  )
}

export const SceneSettingsPanels: FC<Props> = ({
  lighting,
  camera,
  shadingMode,
  disabled,
  onShadingModeChange,
  onLightingChange,
  onLightingReset,
  onCameraChange,
  onCameraReset,
}) => {
  const t = useT()
  const [openPanel, setOpenPanel] = useState<PanelId>(null)

  const toggle = (id: Exclude<PanelId, null>) => {
    setOpenPanel(prev => (prev === id ? null : id))
  }

  return (
    <div className="scene-settings">
      <div
        className="scene-settings-toolbar"
        role="toolbar"
        aria-orientation="vertical"
        aria-label={t('sceneSettings.aria')}
      >
        <ShadingToolbar
          mode={shadingMode}
          onChange={onShadingModeChange}
          disabled={disabled}
          embedded
        />
        <span className="scene-settings-toolbar-sep" aria-hidden />
        <IconButton
          className={`scene-settings-btn${openPanel === 'lighting' ? ' is-active' : ''}`}
          color={openPanel === 'lighting' ? 'primary' : 'default'}
          disabled={disabled}
          title={t('lighting.title')}
          aria-label={t('lighting.title')}
          aria-pressed={openPanel === 'lighting'}
          onClick={() => toggle('lighting')}
        >
          <Icon icon="material-symbols:adjust" aria-hidden />
        </IconButton>
        <IconButton
          className={`scene-settings-btn${openPanel === 'camera' ? ' is-active' : ''}`}
          color={openPanel === 'camera' ? 'primary' : 'default'}
          disabled={disabled}
          title={t('camera.title')}
          aria-label={t('camera.title')}
          aria-pressed={openPanel === 'camera'}
          onClick={() => toggle('camera')}
        >
          <Icon icon="material-symbols:view-in-ar" aria-hidden />
        </IconButton>
        <IconButton
          className="scene-settings-btn"
          disabled={disabled}
          title={
            camera.projection === 'orthographic'
              ? t('camera.projection.perspective')
              : t('camera.projection.orthographic')
          }
          aria-label={
            camera.projection === 'orthographic'
              ? t('camera.projection.perspective')
              : t('camera.projection.orthographic')
          }
          aria-pressed={camera.projection === 'orthographic'}
          onClick={() =>
            onCameraChange(
              'projection',
              camera.projection === 'orthographic' ? 'perspective' : 'orthographic'
            )
          }
        >
          <CameraProjectionIcon projection={camera.projection} />
        </IconButton>
      </div>

      {openPanel === 'lighting' ? (
        <div className="scene-settings-panel" role="dialog" aria-label={t('lighting.title')}>
          <div className="scene-settings-panel-header">
            <strong>{t('lighting.title')}</strong>
            <div className="scene-settings-panel-actions">
              <Button variant="text" size="small" disabled={disabled} onClick={onLightingReset}>
                {t('app.reset')}
              </Button>
              <IconButton size="small" onClick={() => setOpenPanel(null)} aria-label={t('common.close')}>
                <Icon icon="material-symbols:close" aria-hidden />
              </IconButton>
            </div>
          </div>
          <p className="scene-settings-hint">{t('sceneSettings.lighting.hint')}</p>
          <FieldRow id="scene-light-mode" label={t('lighting.mode')}>
            <TextField
              id="scene-light-mode"
              select
              size="small"
              value={lighting.mode}
              disabled={disabled}
              onChange={e => onLightingChange({ mode: e.target.value as LightingMode })}
            >
              {LIGHTING_MODE_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {t(`lighting.mode.${opt.value}` as MessageKey)}
                </MenuItem>
              ))}
            </TextField>
          </FieldRow>
          <NumInput
            id="scene-exposure"
            label={t('lighting.exposure')}
            value={lighting.exposure}
            disabled={disabled}
            step={0.05}
            min={0.1}
            max={3}
            onChange={v => onLightingChange({ exposure: v })}
          />
          <NumInput
            id="scene-env"
            label={t('lighting.envIntensity')}
            value={lighting.envIntensity}
            disabled={disabled || lighting.mode !== 'studio'}
            step={0.05}
            min={0}
            max={3}
            onChange={v => onLightingChange({ envIntensity: v })}
          />
        </div>
      ) : null}

      {openPanel === 'camera' ? (
        <div className="scene-settings-panel" role="dialog" aria-label={t('camera.title')}>
          <div className="scene-settings-panel-header">
            <strong>{t('camera.title')}</strong>
            <div className="scene-settings-panel-actions">
              <Button variant="text" size="small" disabled={disabled} onClick={onCameraReset}>
                {t('app.reset')}
              </Button>
              <IconButton size="small" onClick={() => setOpenPanel(null)} aria-label={t('common.close')}>
                <Icon icon="material-symbols:close" aria-hidden />
              </IconButton>
            </div>
          </div>
          <NumInput
            id="scene-pos-x"
            label={t('camera.posX')}
            value={camera.posX}
            disabled={disabled}
            onChange={v => onCameraChange('posX', v)}
          />
          <NumInput
            id="scene-pos-y"
            label={t('camera.posY')}
            value={camera.posY}
            disabled={disabled}
            onChange={v => onCameraChange('posY', v)}
          />
          <NumInput
            id="scene-pos-z"
            label={t('camera.posZ')}
            value={camera.posZ}
            disabled={disabled}
            onChange={v => onCameraChange('posZ', v)}
          />
          <NumInput
            id="scene-target-x"
            label={t('camera.targetX')}
            value={camera.targetX}
            disabled={disabled}
            onChange={v => onCameraChange('targetX', v)}
          />
          <NumInput
            id="scene-target-y"
            label={t('camera.targetY')}
            value={camera.targetY}
            disabled={disabled}
            onChange={v => onCameraChange('targetY', v)}
          />
          <NumInput
            id="scene-target-z"
            label={t('camera.targetZ')}
            value={camera.targetZ}
            disabled={disabled}
            onChange={v => onCameraChange('targetZ', v)}
          />
          <NumInput
            id="scene-fov"
            label={t('camera.fov')}
            value={camera.fov}
            disabled={disabled || camera.projection === 'orthographic'}
            step={1}
            min={10}
            max={120}
            onChange={v => onCameraChange('fov', v)}
          />
        </div>
      ) : null}
    </div>
  )
}

export { DEFAULT_CAMERA, DEFAULT_LIGHTING }
