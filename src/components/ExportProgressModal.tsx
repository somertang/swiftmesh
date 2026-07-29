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

  if (phase.kind === 'idle') return null

  let label: string
  let percent: number

  if (phase.kind === 'capturing') {
    label = t('export.capturing', { done: phase.done, total: phase.total })
    percent = phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0
  } else {
    label = phase.stage
    percent = phase.percent
  }

  return (
    <div className="modal modal-open z-10000 bg-black/50">
      <div className="modal-box max-w-sm text-center">
        <p className="mb-3 text-sm">{label}</p>
        <progress className="progress progress-primary w-full" value={percent} max={100} />
        <p className="mt-2 text-xs opacity-70">{percent}%</p>
        {canStop && onStop ? (
          <div className="mt-4">
            <button type="button" className="btn btn-error btn-sm" onClick={onStop}>
              {stopLabel ?? 'Stop recording'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
