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
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return
      }}
    >
      <DialogContent className="text-center">
        <Typography variant="body2" className="mb-3">
          {label}
        </Typography>
        <LinearProgress variant="determinate" value={percent} color="primary" />
        <Typography variant="caption" color="text.secondary" className="mt-2 block">
          {percent}%
        </Typography>
        {canStop && onStop ? (
          <div className="mt-4">
            <Button variant="contained" color="error" size="small" onClick={onStop}>
              {stopLabel ?? 'Stop recording'}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
