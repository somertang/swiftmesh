import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { enUS, zhCN } from '@mui/x-date-pickers/locales'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/en'
import 'dayjs/locale/zh-cn'
import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react'
import type { ModelPermissions } from '../desktopTypes'
import { Icon } from '../icons'
import { useLocale, useT } from '../i18n'
import { generateGroupedPassword } from '../lib/smsh/generatePassword'
import { MIN_PASSWORD_LENGTH } from '../lib/smsh/passwordStrength'
import { DEFAULT_MODEL_PERMISSIONS, expiryDateFromDays } from '../lib/smsh/permissions'
import { LoadingButton } from './LoadingButton'

type Props = {
  open: boolean
  modelLabel: string
  /** When > 1, dialog is in batch mode. */
  batchCount?: number
  busy?: boolean
  error?: string | null
  progress?: { index: number; total: number; fileName: string } | null
  /** Batch only: write beside each source (true) or into a chosen folder (false). */
  saveAlongside?: boolean
  onSaveAlongsideChange?: (value: boolean) => void
  onSubmit: (payload: { password: string; permissions: ModelPermissions }) => void
  onCancel: () => void
}

type ExpiryMode = '1' | '3' | '7' | '30' | 'permanent' | 'custom'

const EXPIRY_PRESET_DAYS = {
  '1': 1,
  '3': 3,
  '7': 7,
  '30': 30,
} as const

const EXPIRY_MODES: ExpiryMode[] = ['1', '3', '7', '30', 'permanent', 'custom']

function resolveExpiresAt(mode: ExpiryMode, customExpiresAt: string | null): string | null {
  if (mode === 'permanent') return null
  if (mode === 'custom') return customExpiresAt
  return expiryDateFromDays(EXPIRY_PRESET_DAYS[mode])
}

function formatChipDate(isoDate: string, locale: 'en' | 'zh'): string {
  const parsed = dayjs(isoDate)
  if (!parsed.isValid()) return isoDate
  return locale === 'zh' ? parsed.format('M/D') : parsed.locale('en').format('MMM D')
}

export const EncryptModelDialog: FC<Props> = ({
  open,
  modelLabel,
  batchCount = 1,
  busy = false,
  error = null,
  progress = null,
  saveAlongside = true,
  onSaveAlongsideChange,
  onSubmit,
  onCancel,
}) => {
  const t = useT()
  const { locale } = useLocale()
  const [password, setPassword] = useState('')
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [passwordCustom, setPasswordCustom] = useState(false)
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>('permanent')
  const [customExpiresAt, setCustomExpiresAt] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<ModelPermissions>({
    ...DEFAULT_MODEL_PERMISSIONS,
  })

  const pickerLocaleText = useMemo(
    () =>
      locale === 'zh'
        ? zhCN.components.MuiLocalizationProvider.defaultProps.localeText
        : enUS.components.MuiLocalizationProvider.defaultProps.localeText,
    [locale]
  )
  const adapterLocale = locale === 'zh' ? 'zh-cn' : 'en'

  const customExpiryValue = useMemo(() => {
    if (!customExpiresAt) return null
    const parsed = dayjs(customExpiresAt)
    return parsed.isValid() ? parsed : null
  }, [customExpiresAt])

  const presetExpiryDates = useMemo(
    () => ({
      '1': expiryDateFromDays(1),
      '3': expiryDateFromDays(3),
      '7': expiryDateFromDays(7),
      '30': expiryDateFromDays(30),
    }),
    [open]
  )

  useEffect(() => {
    if (open) {
      setPassword(generateGroupedPassword())
      setPasswordCopied(false)
      setPasswordCustom(false)
      setExpiryMode('permanent')
      setCustomExpiresAt(null)
      setPermissions({ ...DEFAULT_MODEL_PERMISSIONS })
    }
  }, [open])

  const passwordTooShort = password.trim().length < MIN_PASSWORD_LENGTH
  const customExpiryMissing = expiryMode === 'custom' && !customExpiresAt
  const canEncrypt = !passwordTooShort && !customExpiryMissing && !busy

  const handleGenerate = () => {
    setPassword(generateGroupedPassword())
    setPasswordCopied(false)
    setPasswordCustom(false)
  }

  const handleCopy = () => {
    if (!password || !window.desktop?.writeClipboardText) return
    void window.desktop.writeClipboardText(password).then(() => {
      setPasswordCopied(true)
    })
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    setPasswordCopied(false)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canEncrypt) return
    const watermark = permissions.watermark?.trim() || null
    const expiresAt = resolveExpiresAt(expiryMode, customExpiresAt)
    onSubmit({
      password,
      permissions: {
        ...permissions,
        watermark,
        expiresAt,
      },
    })
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="sm"
      fullWidth
      className="encrypt-model-dialog"
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.78)' } },
        paper: { className: 'update-dialog-shell' },
      }}
      aria-labelledby="encrypt-model-title"
    >
      <header className="update-dialog-header">
        <div className="update-dialog-icon" aria-hidden>
          <Icon icon="material-symbols:key" />
        </div>
        <div className="update-dialog-header-text">
          <h2 id="encrypt-model-title" className="update-dialog-title">
            {batchCount > 1 ? t('menu.encryptBatchDialogTitle') : t('menu.encryptDialogTitle')}
          </h2>
          <p className="update-dialog-subtitle">
            {batchCount > 1
              ? t('encrypt.batch.subtitle', { count: batchCount })
              : t('encrypt.subtitle', { modelLabel })}
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <DialogContent className="update-dialog-body encrypt-model-dialog-body">
          {error ? (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          ) : null}

          {progress ? (
            <Alert severity="info" sx={{ mb: 0 }}>
              {t('encrypt.batch.progress', {
                index: progress.index,
                total: progress.total,
                fileName: progress.fileName,
              })}
            </Alert>
          ) : null}

          <Typography variant="body2" color="text.secondary" className="encrypt-disclaimer">
            {t('encrypt.disclaimer')}
          </Typography>

          <section className="encrypt-field-section" aria-label={t('encrypt.password')}>
            <Typography variant="caption" color="text.secondary" component="div">
              {t('encrypt.password')}
            </Typography>

            {passwordCustom ? (
              <TextField
                autoFocus
                fullWidth
                size="small"
                type="text"
                label={t('encrypt.passwordCustom')}
                value={password}
                disabled={busy}
                autoComplete="off"
                error={passwordTooShort}
                helperText={
                  passwordTooShort ? t('encrypt.passwordTooShort', { min: MIN_PASSWORD_LENGTH }) : undefined
                }
                onChange={event => handlePasswordChange(event.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={t('encrypt.generate')} enterDelay={400}>
                          <span>
                            <IconButton
                              edge="end"
                              size="small"
                              aria-label={t('encrypt.generate')}
                              disabled={busy}
                              onClick={handleGenerate}
                            >
                              <Icon icon="material-symbols:refresh" aria-hidden />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip
                          title={
                            passwordCopied
                              ? t('encrypt.passwordCopied')
                              : t('encrypt.copyPassword')
                          }
                          enterDelay={400}
                        >
                          <span>
                            <IconButton
                              edge="end"
                              size="small"
                              aria-label={t('encrypt.copyPassword')}
                              disabled={busy || !password}
                              onClick={handleCopy}
                            >
                              <Icon icon="material-symbols:content-copy" aria-hidden />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            ) : (
              <div className="encrypt-passphrase">
                <p className="encrypt-passphrase-value" aria-live="polite">
                  {password}
                </p>
                <div className="encrypt-passphrase-actions">
                  <Tooltip title={t('encrypt.customizePassword')} enterDelay={400}>
                    <span>
                      <IconButton
                        size="small"
                        aria-label={t('encrypt.customizePassword')}
                        disabled={busy}
                        onClick={() => setPasswordCustom(true)}
                      >
                        <Icon icon="material-symbols:edit" aria-hidden />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={t('encrypt.generate')} enterDelay={400}>
                    <span>
                      <IconButton
                        size="small"
                        aria-label={t('encrypt.generate')}
                        disabled={busy}
                        onClick={handleGenerate}
                      >
                        <Icon icon="material-symbols:refresh" aria-hidden />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={
                      passwordCopied ? t('encrypt.passwordCopied') : t('encrypt.copyPassword')
                    }
                    enterDelay={400}
                  >
                    <span>
                      <IconButton
                        size="small"
                        aria-label={t('encrypt.copyPassword')}
                        disabled={busy || !password}
                        onClick={handleCopy}
                      >
                        <Icon icon="material-symbols:content-copy" aria-hidden />
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>
              </div>
            )}
          </section>

          <section className="encrypt-field-section" aria-labelledby="encrypt-optional-title">
            <Typography id="encrypt-optional-title" variant="subtitle2">
              {t('encrypt.optional.title')}
            </Typography>

            <div className="encrypt-expiry">
              <Typography
                id="encrypt-expiry-label"
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {t('encrypt.expiry.label')}
              </Typography>
              <div
                className="encrypt-expiry-chips"
                role="radiogroup"
                aria-labelledby="encrypt-expiry-label"
              >
                {EXPIRY_MODES.map(mode => {
                  const selected = expiryMode === mode
                  const isoDate =
                    mode === 'permanent'
                      ? null
                      : mode === 'custom'
                        ? customExpiresAt
                        : presetExpiryDates[mode]
                  const name = t(`encrypt.expiry.${mode}`)
                  const label = isoDate
                    ? t('encrypt.expiry.chipWithDate', {
                        label: name,
                        date: formatChipDate(isoDate, locale),
                      })
                    : name
                  const tooltip =
                    mode === 'permanent'
                      ? t('encrypt.expiry.tooltip.permanent')
                      : mode === 'custom'
                        ? t('encrypt.expiry.tooltip.custom')
                        : t('encrypt.expiry.tooltip.preset', { date: isoDate ?? '' })
                  return (
                    <Tooltip key={mode} title={tooltip} enterDelay={400}>
                      <span>
                        <Chip
                          size="small"
                          clickable={!busy}
                          disabled={busy}
                          color={selected ? 'primary' : 'default'}
                          variant={selected ? 'filled' : 'outlined'}
                          label={label}
                          onClick={() => setExpiryMode(mode)}
                          role="radio"
                          aria-checked={selected}
                        />
                      </span>
                    </Tooltip>
                  )
                })}
              </div>

              {expiryMode === 'custom' ? (
                <LocalizationProvider
                  dateAdapter={AdapterDayjs}
                  adapterLocale={adapterLocale}
                  localeText={pickerLocaleText}
                >
                  <DatePicker
                    label={t('encrypt.permissions.expiresAt')}
                    value={customExpiryValue}
                    disabled={busy}
                    format="YYYY-MM-DD"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: 'small',
                        error: customExpiryMissing,
                        helperText: customExpiryMissing
                          ? t('encrypt.expiry.customRequired')
                          : undefined,
                      },
                      field: { clearable: true },
                    }}
                    onChange={(next: Dayjs | null) => {
                      setCustomExpiresAt(
                        next && next.isValid() ? next.format('YYYY-MM-DD') : null
                      )
                    }}
                  />
                </LocalizationProvider>
              ) : null}
            </div>

            <TextField
              fullWidth
              size="small"
              label={t('encrypt.permissions.watermark')}
              value={permissions.watermark ?? ''}
              disabled={busy}
              onChange={event =>
                setPermissions(prev => ({
                  ...prev,
                  watermark: event.target.value,
                }))
              }
            />

            {batchCount > 1 && onSaveAlongsideChange ? (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={saveAlongside}
                      disabled={busy}
                      onChange={event => onSaveAlongsideChange(event.target.checked)}
                    />
                  }
                  label={t('encrypt.batch.saveAlongside')}
                />
                {!saveAlongside ? (
                  <Typography variant="caption" color="text.secondary" component="div">
                    {t('encrypt.batch.chooseOutputDir')}
                  </Typography>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="encrypt-field-section" aria-labelledby="encrypt-permissions-title">
            <Typography id="encrypt-permissions-title" variant="subtitle2">
              {t('encrypt.permissions.title')}
            </Typography>

            <div className="encrypt-permissions">
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={permissions.allowExport}
                    disabled={busy}
                    onChange={event =>
                      setPermissions(prev => ({ ...prev, allowExport: event.target.checked }))
                    }
                  />
                }
                label={t('encrypt.permissions.allowExport')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={permissions.allowRecordVideo}
                    disabled={busy}
                    onChange={event =>
                      setPermissions(prev => ({
                        ...prev,
                        allowRecordVideo: event.target.checked,
                      }))
                    }
                  />
                }
                label={t('encrypt.permissions.allowRecordVideo')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={permissions.allowRecordImages}
                    disabled={busy}
                    onChange={event =>
                      setPermissions(prev => ({
                        ...prev,
                        allowRecordImages: event.target.checked,
                      }))
                    }
                  />
                }
                label={t('encrypt.permissions.allowRecordImages')}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={permissions.allowInspectAssets}
                    disabled={busy}
                    onChange={event =>
                      setPermissions(prev => ({
                        ...prev,
                        allowInspectAssets: event.target.checked,
                      }))
                    }
                  />
                }
                label={t('encrypt.permissions.allowInspectAssets')}
              />
            </div>
          </section>
        </DialogContent>

        <DialogActions className="update-dialog-footer">
          <Button
            onClick={() => {
              if (busy && progress) void window.desktop?.cancelEncryptBatch?.()
              onCancel()
            }}
            disabled={busy && !progress}
            size="small"
          >
            {busy && progress ? t('encrypt.batch.cancel') : t('common.cancel')}
          </Button>
          <LoadingButton
            type="submit"
            variant="contained"
            size="small"
            loading={busy}
            loadingText={
              progress
                ? t('encrypt.batch.encrypting')
                : t('encrypt.encrypting')
            }
            disabled={!canEncrypt}
          >
            {batchCount > 1 ? t('encrypt.batch.submit') : t('encrypt.submit')}
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
