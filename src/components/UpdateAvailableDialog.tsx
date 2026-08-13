import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import type { FC } from 'react'
import { useT } from '../i18n'
import type { UpdatePromptEvent } from '../desktopTypes'
import { formatReleaseNotesHtml } from '../lib/formatReleaseNotes'
import { Icon } from '../icons'
import { LoadingButton } from './LoadingButton'

export type UpdateDialogPhase = 'available' | 'downloading' | 'ready' | 'error'

const PHASE_ICONS: Record<UpdateDialogPhase, string> = {
  available: 'material-symbols:system-update-alt',
  downloading: 'material-symbols:download',
  ready: 'material-symbols:check-circle-outline',
  error: 'material-symbols:error-outline',
}

type Props = {
  open: boolean
  prompt: UpdatePromptEvent | null
  phase: UpdateDialogPhase
  progressPercent?: number
  errorMessage?: string
  busy?: boolean
  onUpdateNow: () => void
  onRestart: () => void
  onLater: () => void
}

export const UpdateAvailableDialog: FC<Props> = ({
  open,
  prompt,
  phase,
  progressPercent = 0,
  errorMessage,
  busy = false,
  onUpdateNow,
  onRestart,
  onLater,
}) => {
  const t = useT()
  if (!prompt) return null

  const releaseNotesHtml = formatReleaseNotesHtml(prompt.releaseNotes)
  const percent = Math.min(100, Math.max(0, Math.round(progressPercent)))
  const manualRelease = Boolean(prompt.releaseUrl)
  const canDismiss = !busy || phase === 'downloading'

  let title = t('update.availableDialogTitle')
  if (phase === 'downloading') title = t('update.downloadingTitle')
  else if (phase === 'ready') title = t('update.readyTitle')
  else if (phase === 'error') title = t('update.errorTitle')

  const subtitle =
    phase === 'available'
      ? t(manualRelease ? 'update.availableDialogIntroMac' : 'update.availableDialogIntro', {
          version: prompt.version,
          current: prompt.currentVersion,
        })
      : null

  return (
    <Dialog
      open={open}
      onClose={canDismiss ? onLater : undefined}
      maxWidth="sm"
      fullWidth
      className="update-available-dialog"
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
          },
        },
        paper: {
          className: 'update-dialog-shell',
        },
      }}
      sx={{ zIndex: theme => theme.zIndex.modal + 4 }}
    >
      <header className="update-dialog-header">
        <div className="update-dialog-icon" aria-hidden>
          <Icon icon={PHASE_ICONS[phase]} />
        </div>
        <div className="update-dialog-header-text">
          <h2 className="update-dialog-title">{title}</h2>
          {subtitle ? <p className="update-dialog-subtitle">{subtitle}</p> : null}
        </div>
      </header>

      <DialogContent className="update-dialog-body">
        {phase === 'available' ? (
          <>
            <Typography variant="subtitle2">{t('update.releaseNotes')}</Typography>
            <div
              className="update-release-notes"
              dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
            />
          </>
        ) : null}

        {phase === 'downloading' ? (
          <>
            <p className="update-dialog-message">
              {t('update.downloadingMessage', { version: prompt.version, percent })}
            </p>
            <LinearProgress
              variant="determinate"
              value={percent}
              color="primary"
              className="update-dialog-progress"
            />
            <Typography variant="caption" color="text.secondary">
              {t('prefs.updateStatus.downloading', { percent })}
            </Typography>
          </>
        ) : null}

        {phase === 'ready' ? (
          <p className="update-dialog-message">
            {t('update.readyMessage', { version: prompt.version })}
          </p>
        ) : null}

        {phase === 'error' ? (
          <p className="update-dialog-message is-error">
            {errorMessage || t('update.errorMessage')}
          </p>
        ) : null}
      </DialogContent>

      <DialogActions className="update-dialog-footer">
        <Button onClick={onLater} disabled={busy && phase === 'available'}>
          {t('update.later')}
        </Button>
        {phase === 'available' ? (
          <LoadingButton
            variant="contained"
            onClick={onUpdateNow}
            loading={busy && !manualRelease}
            loadingText={t('update.startingDownload')}
            autoFocus
          >
            {manualRelease ? t('update.openRelease') : t('update.now')}
          </LoadingButton>
        ) : null}
        {phase === 'ready' ? (
          <LoadingButton
            variant="contained"
            onClick={onRestart}
            loading={busy}
            loadingText={t('update.restarting')}
            autoFocus
          >
            {t('update.restart')}
          </LoadingButton>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}
