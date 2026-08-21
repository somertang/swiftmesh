import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import InputLabel from '@mui/material/InputLabel'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState, type DragEvent, type FC, type KeyboardEvent } from 'react'
import type { OpenedModel, OpenModelResult } from '../desktopTypes'
import { Icon } from '../icons'
import { useT } from '../i18n'
import {
  allowedConvertTargets,
  defaultConvertTarget,
  exportObjectAsGltf,
  loadModelSourceToObject3D,
  revokeModelSourceUrls,
  type ConvertTargetFormat,
} from '../lib/convert'
import { basenameOf, stemFromName } from '../lib/modelSource'
import { resolveDroppedModelFiles } from '../lib/resolveDroppedModel'
import { ModelResolveError, modelSourceFromOpened, openedModelFromFiles } from '../lib/resolveModelSource'
import { LoadingButton } from './LoadingButton'

type Props = {
  open: boolean
  onClose: () => void
  /** After a successful convert, optionally open the output path in the viewer. */
  onOpenResultPath: (filePath: string) => void
  /** Global file-saved toast (same pattern as encrypt). */
  onFileSavedToast: (filePath: string, skippedTextures?: number) => void
}

export const ConvertFormatDialog: FC<Props> = ({
  open,
  onClose,
  onOpenResultPath,
  onFileSavedToast,
}) => {
  const t = useT()
  const [opened, setOpened] = useState<OpenedModel | null>(null)
  const [target, setTarget] = useState<ConvertTargetFormat | ''>('')
  const [openAfter, setOpenAfter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const targets = useMemo(
    () => (opened ? allowedConvertTargets(opened.format) : []),
    [opened]
  )

  useEffect(() => {
    if (!open) {
      setOpened(null)
      setTarget('')
      setOpenAfter(true)
      setBusy(false)
      setError(null)
      setStage(null)
      setDragOver(false)
    }
  }, [open])

  useEffect(() => {
    if (!opened) {
      setTarget('')
      return
    }
    const next = defaultConvertTarget(opened.format)
    setTarget(next ?? '')
  }, [opened])

  const sourceLabel = opened ? basenameOf(opened.path || opened.name) : ''
  const formatChip = opened ? opened.format.toUpperCase() : null

  const applyOpenedModel = (model: OpenedModel) => {
    const allowed = allowedConvertTargets(model.format)
    if (allowed.length === 0) {
      setOpened(null)
      setError(t('convert.unsupportedSource'))
      return
    }
    setError(null)
    setOpened(model)
  }

  const applyOpenResult = (result: OpenModelResult) => {
    if (result.kind === 'locked') {
      setOpened(null)
      setError(t('convert.smshUnsupported'))
      return
    }
    const { kind: _kind, ...model } = result
    applyOpenedModel(model)
  }

  const handleBrowse = async () => {
    if (!window.desktop?.openModel || busy) return
    setError(null)
    try {
      const result = await window.desktop.openModel()
      if (!result) return
      applyOpenResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('convert.failed'))
    }
  }

  const handleDropFiles = async (files: FileList | File[]) => {
    if (busy) return
    setError(null)
    try {
      const resolved = await resolveDroppedModelFiles(files)
      if (!resolved) return
      if (resolved.mode === 'desktop') {
        applyOpenResult(resolved.result)
        return
      }
      const model = await openedModelFromFiles(resolved.files, resolved.nativePath)
      applyOpenedModel(model)
    } catch (err) {
      if (err instanceof ModelResolveError) {
        setOpened(null)
        setError(err.message)
        return
      }
      setError(err instanceof Error ? err.message : t('convert.failed'))
    }
  }

  const onZoneDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    setDragOver(true)
  }

  const onZoneDragLeave = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
  }

  const onZoneDrop = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    if (busy) return
    void handleDropFiles(event.dataTransfer.files)
  }

  const onZoneKeyDown = (event: KeyboardEvent) => {
    if (busy) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void handleBrowse()
    }
  }

  const handleConvert = async () => {
    if (!opened || !target || !window.desktop?.saveModelFile || busy) return
    setBusy(true)
    setError(null)
    let source = modelSourceFromOpened(opened)
    try {
      setStage(t('convert.stageLoad'))
      const root = await loadModelSourceToObject3D(source)
      setStage(t('convert.stageExport'))
      const exported = await exportObjectAsGltf(root, { binary: target === 'glb' })
      setStage(t('convert.stageSave'))
      const saved = await window.desktop.saveModelFile({
        defaultName: `${stemFromName(opened.name)}.${target}`,
        data: exported.data,
        format: target,
        dialogTitle: t('convert.saveDialogTitle'),
      })
      if (!saved.ok) {
        if (saved.reason === 'canceled') {
          setStage(null)
          return
        }
        setError(t('convert.saveFailed', { reason: saved.reason }))
        return
      }
      onClose()
      onFileSavedToast(saved.path, exported.skippedTextures)
      if (openAfter) {
        onOpenResultPath(saved.path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('convert.failed'))
    } finally {
      revokeModelSourceUrls(source)
      setBusy(false)
      setStage(null)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      className="encrypt-model-dialog"
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.78)' } },
        paper: { className: 'update-dialog-shell' },
      }}
      aria-labelledby="convert-format-title"
    >
      <header className="update-dialog-header">
        <div className="update-dialog-icon" aria-hidden>
          <Icon icon="material-symbols:view-in-ar" />
        </div>
        <div className="update-dialog-header-text">
          <h2 id="convert-format-title" className="update-dialog-title">
            {t('convert.dialogTitle')}
          </h2>
          <p className="update-dialog-subtitle">{t('convert.subtitle')}</p>
        </div>
      </header>

      <form
        onSubmit={event => {
          event.preventDefault()
          void handleConvert()
        }}
      >
        <DialogContent className="update-dialog-body encrypt-model-dialog-body">
          {error ? (
            <Alert severity="error" sx={{ mb: 0 }}>
              {error}
            </Alert>
          ) : null}

          <section className="encrypt-field-section" aria-label={t('convert.source')}>
            <Typography variant="caption" color="text.secondary" component="div">
              {t('convert.source')}
            </Typography>

            {opened ? (
              <div className="convert-file-card">
                <div className="convert-file-card-icon" aria-hidden>
                  <Icon icon="material-symbols:draft" />
                </div>
                <div className="convert-file-card-body">
                  <div className="convert-file-card-name" title={sourceLabel}>
                    {sourceLabel}
                  </div>
                  {formatChip ? (
                    <Chip label={formatChip} size="small" variant="outlined" />
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="small"
                  disabled={busy}
                  onClick={() => void handleBrowse()}
                >
                  {t('convert.change')}
                </Button>
              </div>
            ) : (
              <div
                className={`convert-dropzone${dragOver ? ' is-dragover' : ''}${busy ? ' is-disabled' : ''}`}
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-disabled={busy}
                aria-label={t('convert.dropTitle')}
                onClick={() => {
                  if (!busy) void handleBrowse()
                }}
                onKeyDown={onZoneKeyDown}
                onDragEnter={onZoneDragOver}
                onDragOver={onZoneDragOver}
                onDragLeave={onZoneDragLeave}
                onDrop={onZoneDrop}
              >
                <div className="convert-dropzone-icon" aria-hidden>
                  <Icon icon="material-symbols:folder-open" />
                </div>
                <div className="convert-dropzone-title">{t('convert.dropTitle')}</div>
                <div className="convert-dropzone-hint">{t('convert.formatsHint')}</div>
              </div>
            )}
          </section>

          <section className="encrypt-field-section" aria-label={t('convert.target')}>
            <FormControl fullWidth size="small" disabled={!opened || busy}>
              <InputLabel id="convert-target-label">{t('convert.target')}</InputLabel>
              <Select
                labelId="convert-target-label"
                label={t('convert.target')}
                value={target}
                onChange={event => setTarget(event.target.value as ConvertTargetFormat | '')}
              >
                {targets.map(fmt => (
                  <MenuItem key={fmt} value={fmt}>
                    {fmt === 'glb' ? t('convert.targetGlb') : t('convert.targetGltf')}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {opened ? (
                  <Tooltip title={t('convert.formatsHint')} enterDelay={400}>
                    <span>{t('convert.formatsHint')}</span>
                  </Tooltip>
                ) : (
                  t('convert.targetHelper')
                )}
              </FormHelperText>
            </FormControl>
          </section>

          {busy && stage ? (
            <div className="convert-progress">
              <Typography variant="caption" color="text.secondary">
                {stage}
              </Typography>
              <LinearProgress className="update-dialog-progress" sx={{ mt: 0.5, mb: 0 }} />
            </div>
          ) : null}

          <FormControlLabel
            className="convert-open-after"
            control={
              <Checkbox
                checked={openAfter}
                disabled={busy}
                onChange={event => setOpenAfter(event.target.checked)}
                size="small"
              />
            }
            label={t('convert.openAfter')}
          />
        </DialogContent>

        <DialogActions className="update-dialog-footer">
          <Button type="button" disabled={busy} onClick={onClose}>
            {t('convert.cancel')}
          </Button>
          <LoadingButton
            type="submit"
            variant="contained"
            disabled={!opened || !target}
            loading={busy}
          >
            {t('convert.submit')}
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
