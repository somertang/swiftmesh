import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import type { Theme } from '@mui/material/styles'
import { useCallback, useEffect, useState, type FC } from 'react'
import { useT } from '../i18n'
import { LoadingButton } from './LoadingButton'

export type AppToastItem =
  | {
      id: string
      kind: 'text'
      severity: 'info' | 'error' | 'success'
      message: string
      durationMs: number
    }
  | {
      id: string
      kind: 'recordingSaved'
      path: string
      durationMs: number
    }

type ToastPhase = 'enter' | 'shown' | 'exit'

type StackItem = {
  toast: AppToastItem
  phase: ToastPhase
}

const MAX_TOASTS = 3
const TOAST_ANIM_MS = 280

export function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Newest first; drop oldest when over the cap. */
export function pushAppToast(prev: AppToastItem[], toast: AppToastItem): AppToastItem[] {
  return [toast, ...prev].slice(0, MAX_TOASTS)
}

function themedSnackAlertSx(accent: 'primary' | 'error') {
  return (theme: Theme) => ({
    maxWidth: 520,
    width: '100%',
    alignItems: 'flex-start' as const,
    color: theme.palette.text.primary,
    bgcolor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderLeft: `3px solid ${theme.palette[accent].main}`,
    borderRadius: 1.5,
    boxShadow: theme.shadows[8],
    backgroundImage: 'none',
    '& .MuiAlert-icon': {
      color: theme.palette[accent].main,
      opacity: 1,
    },
    '& .MuiAlert-action .MuiIconButton-root': {
      color: theme.palette.text.secondary,
    },
    '& .MuiAlert-message': {
      width: '100%',
      color: theme.palette.text.primary,
    },
  })
}

function ToastCard({
  toast,
  phase,
  onRequestExit,
  onExitComplete,
  onEntered,
  onOpenRecordingFailed,
}: {
  toast: AppToastItem
  phase: ToastPhase
  onRequestExit: (id: string) => void
  onExitComplete: (id: string) => void
  onEntered: (id: string) => void
  onOpenRecordingFailed: (reason: string) => void
}) {
  const t = useT()
  const [openingVideo, setOpeningVideo] = useState(false)

  useEffect(() => {
    if (phase !== 'enter') return
    const timer = window.setTimeout(() => onEntered(toast.id), TOAST_ANIM_MS)
    return () => window.clearTimeout(timer)
  }, [phase, toast.id, onEntered])

  useEffect(() => {
    if (phase === 'exit') return
    const timer = window.setTimeout(() => onRequestExit(toast.id), toast.durationMs)
    return () => window.clearTimeout(timer)
  }, [phase, toast.id, toast.durationMs, onRequestExit])

  useEffect(() => {
    if (phase !== 'exit') return
    const timer = window.setTimeout(() => onExitComplete(toast.id), TOAST_ANIM_MS)
    return () => window.clearTimeout(timer)
  }, [phase, toast.id, onExitComplete])

  const alert =
    toast.kind === 'recordingSaved' ? (
      <Alert
        severity="success"
        variant="standard"
        onClose={() => onRequestExit(toast.id)}
        sx={themedSnackAlertSx('primary')}
      >
        <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600 }}>
          {t('record.savedTitle')}
        </Typography>
        <Typography
          variant="caption"
          component="div"
          className="mono"
          sx={{ mt: 0.75, wordBreak: 'break-all', color: 'text.secondary' }}
        >
          {t('record.savedPath', { path: toast.path })}
        </Typography>
        <LoadingButton
          color="primary"
          size="small"
          loading={openingVideo}
          loadingText={t('record.openingVideo')}
          sx={{
            mt: 1.75,
            px: 1,
            py: 0.75,
            minWidth: 0,
            fontSize: '0.75rem',
            lineHeight: 1.4,
            fontWeight: 600,
          }}
          onClick={() => {
            void (async () => {
              setOpeningVideo(true)
              try {
                const res = await window.desktop?.openPath?.(toast.path)
                if (res && !res.ok) onOpenRecordingFailed(res.reason)
              } finally {
                setOpeningVideo(false)
              }
            })()
          }}
        >
          {t('record.openVideo')}
        </LoadingButton>
      </Alert>
    ) : (
      <Alert
        severity={toast.severity}
        variant="standard"
        onClose={() => onRequestExit(toast.id)}
        sx={themedSnackAlertSx(toast.severity === 'error' ? 'error' : 'primary')}
      >
        {toast.message}
      </Alert>
    )

  return (
    <div
      className={`app-toast-item is-${phase}`}
      data-toast-id={toast.id}
    >
      {alert}
    </div>
  )
}

type Props = {
  toasts: AppToastItem[]
  onDismiss: (id: string) => void
  onOpenRecordingFailed: (reason: string) => void
}

export const AppToastStack: FC<Props> = ({ toasts, onDismiss, onOpenRecordingFailed }) => {
  const [items, setItems] = useState<StackItem[]>([])

  useEffect(() => {
    setItems(prev => {
      const propIds = new Set(toasts.map(toast => toast.id))
      const prevIds = new Set(prev.map(item => item.toast.id))

      const next = prev.map(item =>
        !propIds.has(item.toast.id) && item.phase !== 'exit'
          ? { ...item, phase: 'exit' as const }
          : item
      )

      const additions = toasts
        .filter(toast => !prevIds.has(toast.id))
        .map(toast => ({ toast, phase: 'enter' as const }))

      return additions.length > 0 ? [...additions, ...next] : next
    })
  }, [toasts])

  const onRequestExit = useCallback((id: string) => {
    setItems(prev =>
      prev.map(item =>
        item.toast.id === id && item.phase !== 'exit'
          ? { ...item, phase: 'exit' as const }
          : item
      )
    )
  }, [])

  const onEntered = useCallback((id: string) => {
    setItems(prev =>
      prev.map(item =>
        item.toast.id === id && item.phase === 'enter'
          ? { ...item, phase: 'shown' as const }
          : item
      )
    )
  }, [])

  const onExitComplete = useCallback(
    (id: string) => {
      setItems(prev => prev.filter(item => item.toast.id !== id))
      onDismiss(id)
    },
    [onDismiss]
  )

  if (items.length === 0) return null

  return (
    <div className="app-toast-stack" role="region" aria-live="polite">
      {items.map(item => (
        <ToastCard
          key={item.toast.id}
          toast={item.toast}
          phase={item.phase}
          onRequestExit={onRequestExit}
          onExitComplete={onExitComplete}
          onEntered={onEntered}
          onOpenRecordingFailed={onOpenRecordingFailed}
        />
      ))}
    </div>
  )
}
