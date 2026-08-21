import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FC,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Icon } from '../icons'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/messages'
import {
  exportObjectAsGltf,
  loadModelSourceToObject3D,
  type ConvertTargetFormat,
} from '../lib/convert'
import { stemFromName, type ModelSource } from '../lib/modelSource'
import {
  bakeWatermarkToAlbedo,
  DEFAULT_WATERMARK_CONFIG,
  WATERMARK_FONT_PRESETS,
  WatermarkStampError,
  createStampTexture,
  type WatermarkConfig,
  type WatermarkMode,
} from '../lib/watermark'
import { LoadingButton } from './LoadingButton'

const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280
const PANEL_WIDTH_MAX = 520
let sessionPanelWidth = PANEL_WIDTH_DEFAULT

const IMAGE_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'

type Props = {
  open: boolean
  onClose: () => void
  /** Active tab model (watermark only applies to this). */
  currentModel: ModelSource | null
  /** Push live preview config to ViewerScene while panel is open. */
  onPreviewConfigChange: (config: WatermarkConfig | null) => void
  onFileSavedToast: (filePath: string, skippedTextures?: number) => void
}

function fontPresetLabel(id: string, t: (key: MessageKey) => string): string {
  switch (id) {
    case 'system-ui':
      return t('watermark.fontSystem')
    case 'serif':
      return t('watermark.fontSerif')
    case 'monospace':
      return t('watermark.fontMono')
    case 'sans-sc':
      return t('watermark.fontSansSc')
    default:
      return id
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

export const WatermarkToolDialog: FC<Props> = ({
  open,
  onClose,
  currentModel,
  onPreviewConfigChange,
  onFileSavedToast,
}) => {
  const t = useT()
  const [target, setTarget] = useState<ConvertTargetFormat>('glb')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [width, setWidth] = useState(() => sessionPanelWidth)
  const [imageDragOver, setImageDragOver] = useState(false)

  const [mode, setMode] = useState<WatermarkMode>('text')
  const [text, setText] = useState(DEFAULT_WATERMARK_CONFIG.text)
  const [color, setColor] = useState(DEFAULT_WATERMARK_CONFIG.color)
  const [fontFamily, setFontFamily] = useState(DEFAULT_WATERMARK_CONFIG.fontFamily)
  const [intensity, setIntensity] = useState(DEFAULT_WATERMARK_CONFIG.intensity)
  const [tileScale, setTileScale] = useState(DEFAULT_WATERMARK_CONFIG.tileScale)
  const [imageName, setImageName] = useState<string | null>(null)
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageObjectUrlRef = useRef<string | null>(null)

  const controlsDisabled = busy || !currentModel

  const previewConfig: WatermarkConfig | null = useMemo(() => {
    if (!open || busy || !currentModel) return null
    if (mode === 'text' && !text.trim()) return null
    if (mode === 'image' && !imageEl) return null
    return {
      mode,
      text,
      color,
      fontFamily,
      fontIsCustom: false,
      intensity,
      tileScale,
      rotationY: DEFAULT_WATERMARK_CONFIG.rotationY,
      image: imageEl,
    }
  }, [
    open,
    busy,
    currentModel,
    mode,
    text,
    color,
    fontFamily,
    intensity,
    tileScale,
    imageEl,
  ])

  useEffect(() => {
    if (!previewConfig) {
      onPreviewConfigChange(null)
      return
    }

    // Validate image stamps before pushing preview so failures surface in the panel
    // instead of a silent clear in ViewerScene.
    if (previewConfig.mode === 'image') {
      let stamp: ReturnType<typeof createStampTexture> | null = null
      try {
        stamp = createStampTexture(previewConfig)
        onPreviewConfigChange(previewConfig)
      } catch (err) {
        onPreviewConfigChange(null)
        if (err instanceof WatermarkStampError && err.code === 'empty') {
          setError(t('watermark.imageStampEmpty'))
        } else {
          setError(err instanceof Error ? err.message : t('watermark.failed'))
        }
      } finally {
        stamp?.dispose()
      }
      return
    }

    onPreviewConfigChange(previewConfig)
  }, [previewConfig, onPreviewConfigChange, t])

  useEffect(() => {
    if (!open) {
      onPreviewConfigChange(null)
      setTarget('glb')
      setBusy(false)
      setError(null)
      setStage(null)
      setImageDragOver(false)
      setMode('text')
      setText(DEFAULT_WATERMARK_CONFIG.text)
      setColor(DEFAULT_WATERMARK_CONFIG.color)
      setFontFamily(DEFAULT_WATERMARK_CONFIG.fontFamily)
      setIntensity(DEFAULT_WATERMARK_CONFIG.intensity)
      setTileScale(DEFAULT_WATERMARK_CONFIG.tileScale)
      setImageName(null)
      setImageEl(null)
      setImagePreviewUrl(null)
      if (imageObjectUrlRef.current) {
        URL.revokeObjectURL(imageObjectUrlRef.current)
        imageObjectUrlRef.current = null
      }
    }
    // Only reset when panel opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const applyImageFile = useCallback(
    (file: File) => {
      if (!isImageFile(file)) {
        setError(t('watermark.needImage'))
        return
      }
      if (imageObjectUrlRef.current) {
        URL.revokeObjectURL(imageObjectUrlRef.current)
        imageObjectUrlRef.current = null
      }
      const url = URL.createObjectURL(file)
      imageObjectUrlRef.current = url
      const img = new Image()
      img.onload = () => {
        const finish = () => {
          setImageEl(img)
          setImageName(file.name)
          setImagePreviewUrl(url)
          setError(null)
        }
        // Ensure pixels are decoded before stamp generation / preview.
        if (typeof img.decode === 'function') {
          void img.decode().then(finish).catch(finish)
        } else {
          finish()
        }
      }
      img.onerror = () => {
        setError(t('watermark.needImage'))
        URL.revokeObjectURL(url)
        imageObjectUrlRef.current = null
        setImagePreviewUrl(null)
      }
      img.src = url
    },
    [t]
  )

  const handleImagePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    applyImageFile(file)
  }

  const onImageZoneDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (controlsDisabled) return
    setImageDragOver(true)
  }

  const onImageZoneDragLeave = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setImageDragOver(false)
  }

  const onImageZoneDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setImageDragOver(false)
    if (controlsDisabled) return
    const file = event.dataTransfer.files?.[0]
    if (file) applyImageFile(file)
  }

  const onImageZoneKeyDown = (event: KeyboardEvent) => {
    if (controlsDisabled) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      imageInputRef.current?.click()
    }
  }

  const buildConfig = (): WatermarkConfig | null => {
    if (mode === 'text' && !text.trim()) {
      setError(t('watermark.needText'))
      return null
    }
    if (mode === 'image' && !imageEl) {
      setError(t('watermark.needImage'))
      return null
    }
    return {
      mode,
      text,
      color,
      fontFamily,
      fontIsCustom: false,
      intensity,
      tileScale,
      rotationY: DEFAULT_WATERMARK_CONFIG.rotationY,
      image: imageEl,
    }
  }

  const handleExport = async () => {
    if (!window.desktop?.saveModelFile || busy) return
    if (!currentModel) {
      setError(t('watermark.needSource'))
      return
    }
    const config = buildConfig()
    if (!config) return

    setBusy(true)
    setError(null)
    onPreviewConfigChange(null)

    try {
      setStage(t('watermark.stageLoad'))
      const root = await loadModelSourceToObject3D(currentModel)
      setStage(t('watermark.stageBake'))
      bakeWatermarkToAlbedo(root, config)
      setStage(t('watermark.stageExport'))
      const exported = await exportObjectAsGltf(root, { binary: target === 'glb' })
      setStage(t('watermark.stageSave'))
      const defaultStem = stemFromName(currentModel.label)
      const saved = await window.desktop.saveModelFile({
        defaultName: `${defaultStem}-watermark.${target}`,
        data: exported.data,
        format: target,
        sourcePath: currentModel.path ?? undefined,
        dialogTitle: t('watermark.saveDialogTitle'),
      })
      if (!saved.ok) {
        if (saved.reason === 'canceled') {
          setStage(null)
          return
        }
        setError(t('watermark.saveFailed', { reason: saved.reason }))
        return
      }
      onClose()
      onFileSavedToast(saved.path, exported.skippedTextures)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('watermark.failed'))
    } finally {
      setBusy(false)
      setStage(null)
    }
  }

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = width
      const targetEl = event.currentTarget
      targetEl.setPointerCapture(event.pointerId)

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          PANEL_WIDTH_MAX,
          Math.max(PANEL_WIDTH_MIN, startWidth + (ev.clientX - startX))
        )
        sessionPanelWidth = next
        setWidth(next)
      }

      const onUp = (ev: PointerEvent) => {
        targetEl.releasePointerCapture(ev.pointerId)
        targetEl.removeEventListener('pointermove', onMove)
        targetEl.removeEventListener('pointerup', onUp)
        targetEl.removeEventListener('pointercancel', onUp)
      }

      targetEl.addEventListener('pointermove', onMove)
      targetEl.addEventListener('pointerup', onUp)
      targetEl.addEventListener('pointercancel', onUp)
    },
    [width]
  )

  const canSubmit = Boolean(currentModel) && !busy && (mode === 'text' ? Boolean(text.trim()) : Boolean(imageEl))

  if (!open) return null

  return (
    <div className="watermark-dock" role="complementary" aria-labelledby="watermark-tool-title">
      <div className="watermark-panel inspect-panel" style={{ width }}>
        <div className="inspect-panel-header">
          <div className="watermark-panel-header-text">
            <span id="watermark-tool-title" className="inspect-panel-title">
              {t('watermark.dialogTitle')}
            </span>
            <p className="watermark-panel-subtitle">{t('watermark.subtitle')}</p>
          </div>
          <IconButton
            size="small"
            onClick={busy ? undefined : onClose}
            disabled={busy}
            aria-label={t('common.close')}
          >
            <Icon icon="material-symbols:close" aria-hidden />
          </IconButton>
        </div>

        <form
          className="watermark-panel-form"
          onSubmit={event => {
            event.preventDefault()
            void handleExport()
          }}
        >
          <div className="watermark-panel-body inspect-panel-body">
            {error ? (
              <Alert severity="error" sx={{ mb: 0 }}>
                {error}
              </Alert>
            ) : null}

            <section className="encrypt-field-section" aria-label={t('watermark.mode')}>
              <FormControl fullWidth size="small" disabled={controlsDisabled}>
                <InputLabel id="watermark-mode-label">{t('watermark.mode')}</InputLabel>
                <Select
                  labelId="watermark-mode-label"
                  label={t('watermark.mode')}
                  value={mode}
                  onChange={event => setMode(event.target.value as WatermarkMode)}
                >
                  <MenuItem value="text">{t('watermark.modeText')}</MenuItem>
                  <MenuItem value="image">{t('watermark.modeImage')}</MenuItem>
                </Select>
              </FormControl>
            </section>

            {mode === 'text' ? (
              <>
                <TextField
                  fullWidth
                  size="small"
                  label={t('watermark.text')}
                  value={text}
                  disabled={controlsDisabled}
                  onChange={event => setText(event.target.value)}
                />
                <div className="watermark-color-row encrypt-field-section">
                  <TextField
                    size="small"
                    label={t('watermark.color')}
                    type="color"
                    value={color}
                    disabled={controlsDisabled}
                    onChange={event => setColor(event.target.value)}
                    sx={{ width: 96, flexShrink: 0 }}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <FormControl fullWidth size="small" disabled={controlsDisabled}>
                    <InputLabel id="watermark-font-label">{t('watermark.font')}</InputLabel>
                    <Select
                      labelId="watermark-font-label"
                      label={t('watermark.font')}
                      value={fontFamily}
                      onChange={event => setFontFamily(event.target.value)}
                    >
                      {WATERMARK_FONT_PRESETS.map(preset => (
                        <MenuItem key={preset.id} value={preset.id}>
                          {fontPresetLabel(preset.id, t)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </div>
              </>
            ) : (
              <section className="encrypt-field-section" aria-label={t('watermark.image')}>
                <Typography variant="caption" color="text.secondary" component="div">
                  {t('watermark.image')}
                </Typography>
                {imageEl && imagePreviewUrl ? (
                  <div className="watermark-image-card convert-file-card">
                    <div className="watermark-image-thumb-wrap" aria-hidden>
                      <img src={imagePreviewUrl} alt="" className="watermark-image-thumb" />
                    </div>
                    <div className="convert-file-card-body">
                      <div className="convert-file-card-name" title={imageName ?? undefined}>
                        {imageName}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="small"
                      disabled={controlsDisabled}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      {t('watermark.change')}
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`convert-dropzone watermark-image-dropzone${imageDragOver ? ' is-dragover' : ''}${controlsDisabled ? ' is-disabled' : ''}`}
                    role="button"
                    tabIndex={controlsDisabled ? -1 : 0}
                    aria-disabled={controlsDisabled}
                    aria-label={t('watermark.imageDropTitle')}
                    onClick={() => {
                      if (!controlsDisabled) imageInputRef.current?.click()
                    }}
                    onKeyDown={onImageZoneKeyDown}
                    onDragEnter={onImageZoneDragOver}
                    onDragOver={onImageZoneDragOver}
                    onDragLeave={onImageZoneDragLeave}
                    onDrop={onImageZoneDrop}
                  >
                    <div className="convert-dropzone-icon" aria-hidden>
                      <Icon icon="material-symbols:image" />
                    </div>
                    <div className="convert-dropzone-title">{t('watermark.imageDropTitle')}</div>
                    <div className="convert-dropzone-hint">{t('watermark.imageHint')}</div>
                  </div>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  hidden
                  onChange={handleImagePick}
                />
              </section>
            )}

            <section className="encrypt-field-section" aria-label={t('watermark.intensity')}>
              <Typography variant="caption" color="text.secondary" component="div">
                {t('watermark.intensity')}: {Math.round(intensity * 100)}%
              </Typography>
              <Slider
                size="small"
                min={0}
                max={1}
                step={0.01}
                value={intensity}
                disabled={controlsDisabled}
                onChange={(_e, value) => setIntensity(value as number)}
              />
            </section>

            <section
              className="encrypt-field-section"
              aria-label={
                mode === 'image' ? t('watermark.imageSize') : t('watermark.tileScale')
              }
            >
              <Typography variant="caption" color="text.secondary" component="div">
                {mode === 'image' ? t('watermark.imageSize') : t('watermark.tileScale')}:{' '}
                {tileScale.toFixed(2)}
              </Typography>
              <Slider
                size="small"
                min={0.2}
                max={8}
                step={0.05}
                value={tileScale}
                disabled={controlsDisabled}
                onChange={(_e, value) => setTileScale(value as number)}
              />
              <Typography variant="caption" color="text.secondary" component="div">
                {mode === 'image' ? t('watermark.imageSizeHint') : t('watermark.tileScaleHint')}
              </Typography>
            </section>

            <FormControl fullWidth size="small" disabled={controlsDisabled}>
              <InputLabel id="watermark-target-label">{t('watermark.target')}</InputLabel>
              <Select
                labelId="watermark-target-label"
                label={t('watermark.target')}
                value={target}
                onChange={event => setTarget(event.target.value as ConvertTargetFormat)}
              >
                <MenuItem value="glb">{t('watermark.targetGlb')}</MenuItem>
                <MenuItem value="gltf">{t('watermark.targetGltf')}</MenuItem>
              </Select>
            </FormControl>

            {busy && stage ? (
              <div className="convert-progress">
                <Typography variant="caption" color="text.secondary">
                  {stage}
                </Typography>
                <LinearProgress className="update-dialog-progress" sx={{ mt: 0.5, mb: 0 }} />
              </div>
            ) : null}
          </div>

          <div className="watermark-panel-footer">
            <Button type="button" disabled={busy} onClick={onClose}>
              {t('watermark.cancel')}
            </Button>
            <LoadingButton type="submit" variant="contained" disabled={!canSubmit} loading={busy}>
              {t('watermark.submit')}
            </LoadingButton>
          </div>
        </form>

        <div
          className="inspect-resize-handle"
          onPointerDown={onResizePointerDown}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('common.resizePanel')}
        />
      </div>
    </div>
  )
}
