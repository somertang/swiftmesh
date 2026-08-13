import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import type { FC } from 'react'
import { useT } from '../i18n'

export type ExportPhase =
  | { kind: 'capturing'; done: number; total: number }
  | { kind: 'encoding'; stage: string; percent: number }
  | { kind: 'idle' }

type Props = {
  phase: ExportPhase
  canStop?: boolean
  stopLabel?: string
  onStop?: () => void
}

export const ExportProgressModal: FC<Props> = ({ phase, canStop = false, stopLabel, onStop }) => {
  const t = useT()

  const open = phase.kind !== 'idle'

  let label = ''
  let percent = 0

  if (phase.kind === 'capturing') {
    label = t('export.capturing', { done: phase.done, total: phase.total })
    percent = phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0
  } else if (phase.kind === 'encoding') {
    label = phase.stage
    percent = phase.percent
  }

  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      className="z-10000"
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.82)',
          },
        },
        paper: {
          sx: {
            backgroundImage: 'none',
            borderRadius: 2,
            boxShadow: 'var(--shadow-dialog)',
            px: 0.5,
          },
        },
      }}
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return
      }}
    >
      <DialogContent
        sx={{
          textAlign: 'center',
          px: 3.5,
          pt: 3.5,
          pb: 3,
        }}
      >
        <Typography variant="body2" sx={{ mb: 2.5 }}>
          {label}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={percent}
          color="primary"
          sx={{
            height: 6,
            borderRadius: 999,
            mx: 0.5,
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
          {percent}%
        </Typography>
        {canStop && onStop ? (
          <Button
            variant="contained"
            color="error"
            onClick={onStop}
            sx={{ mt: 3 }}
          >
            {stopLabel ?? 'Stop recording'}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
