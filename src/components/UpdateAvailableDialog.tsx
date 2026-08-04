import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import type { FC } from 'react'
import { useT } from '../i18n'
import type { UpdatePromptEvent } from '../desktopTypes'
import { formatReleaseNotesHtml } from '../lib/formatReleaseNotes'
import { LoadingButton } from './LoadingButton'
import Button from '@mui/material/Button'

export type UpdateDialogPhase = 'available' | 'downloading' | 'ready' | 'error'

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
  const canDismiss = !busy || phase === 'downloading'

  let title = t('update.availableDialogTitle')
  if (phase === 'downloading') title = t('update.downloadingTitle')
  else if (phase === 'ready') title = t('update.readyTitle')
  else if (phase === 'error') title = t('update.errorTitle')

  return (
    <Dialog
      open={open}
      onClose={canDismiss ? onLater : undefined}
      maxWidth="sm"
      fullWidth
      className="update-available-dialog"
      sx={{ zIndex: theme => theme.zIndex.modal + 4 }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {phase === 'available' ? (
          <>
            <Typography variant="body2" sx={{ mb: 1.25, color: 'text.secondary' }}>
              {t('update.availableDialogIntro', {
                version: prompt.version,
                current: prompt.currentVersion,
              })}
            </Typography>
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              {t('update.releaseNotes')}
            </Typography>
            <div
              className="update-release-notes"
              dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
            />
          </>
        ) : null}

        {phase === 'downloading' ? (
          <>
            <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
              {t('update.downloadingMessage', { version: prompt.version, percent })}
            </Typography>
            <LinearProgress variant="determinate" value={percent} sx={{ mb: 0.75 }} />
            <Typography variant="caption" color="text.secondary">
              {t('prefs.updateStatus.downloading', { percent })}
            </Typography>
          </>
        ) : null}

        {phase === 'ready' ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('update.readyMessage', { version: prompt.version })}
          </Typography>
        ) : null}

        {phase === 'error' ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {errorMessage || t('update.errorMessage')}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onLater} disabled={busy && phase === 'available'}>
          {t('update.later')}
        </Button>
        {phase === 'available' ? (
          <LoadingButton
            variant="contained"
            onClick={onUpdateNow}
            loading={busy}
            loadingText={t('update.startingDownload')}
            autoFocus
          >
            {t('update.now')}
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
