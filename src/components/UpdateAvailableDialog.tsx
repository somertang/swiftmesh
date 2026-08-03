import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import type { FC } from 'react'
import { useT } from '../i18n'
import type { UpdatePromptEvent } from '../desktopTypes'
import { formatReleaseNotesHtml } from '../lib/formatReleaseNotes'

type Props = {
  open: boolean
  prompt: UpdatePromptEvent | null
  busy?: boolean
  onUpdateNow: () => void
  onLater: () => void
}

export const UpdateAvailableDialog: FC<Props> = ({
  open,
  prompt,
  busy = false,
  onUpdateNow,
  onLater,
}) => {
  const t = useT()
  if (!prompt) return null

  const releaseNotesHtml = formatReleaseNotesHtml(prompt.releaseNotes)

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onLater}
      maxWidth="sm"
      fullWidth
      className="update-available-dialog"
      sx={{ zIndex: theme => theme.zIndex.modal + 4 }}
    >
      <DialogTitle>{t('update.availableDialogTitle')}</DialogTitle>
      <DialogContent dividers>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onLater} disabled={busy}>
          {t('update.later')}
        </Button>
        <Button variant="contained" onClick={onUpdateNow} disabled={busy} autoFocus>
          {t('update.now')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
