import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState, type FC, type FormEvent } from 'react'
import { Icon } from '../icons'
import { useT } from '../i18n'
import { LoadingButton } from './LoadingButton'

type Props = {
  open: boolean
  fileName: string
  busy?: boolean
  error?: string | null
  password?: string
  onPasswordChange?: (password: string) => void
  onSubmit: (password: string) => void
  onCancel: () => void
}

export const UnlockModelDialog: FC<Props> = ({
  open,
  fileName,
  busy = false,
  error = null,
  password: controlledPassword,
  onPasswordChange,
  onSubmit,
  onCancel,
}) => {
  const t = useT()
  const [internalPassword, setInternalPassword] = useState('')

  const password = controlledPassword ?? internalPassword
  const setPassword = onPasswordChange ?? setInternalPassword

  useEffect(() => {
    if (!open && controlledPassword === undefined) setInternalPassword('')
  }, [open, controlledPassword])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!password.trim() || busy) return
    onSubmit(password)
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
      className="unlock-model-dialog"
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.78)' } },
        paper: { className: 'update-dialog-shell' },
      }}
      aria-labelledby="unlock-model-title"
    >
      <header className="update-dialog-header">
        <div className="update-dialog-icon" aria-hidden>
          <Icon icon="material-symbols:key" />
        </div>
        <div className="update-dialog-header-text">
          <h2 id="unlock-model-title" className="update-dialog-title">
            {t('unlock.title')}
          </h2>
          <p className="update-dialog-subtitle">{t('unlock.subtitle', { fileName })}</p>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <DialogContent className="update-dialog-body">
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('unlock.prompt')}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type="text"
            label={t('unlock.password')}
            value={password}
            disabled={busy}
            autoComplete="off"
            onChange={event => setPassword(event.target.value)}
          />
        </DialogContent>

        <DialogActions className="update-dialog-footer">
          <Button onClick={onCancel} disabled={busy} size="small">
            {t('common.cancel')}
          </Button>
          <LoadingButton
            type="submit"
            variant="contained"
            size="small"
            loading={busy}
            loadingText={t('unlock.unlocking')}
            disabled={!password.trim()}
          >
            {t('unlock.submit')}
          </LoadingButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
