import IconButton from '@mui/material/IconButton'
import type { ReactNode } from 'react'
import { Icon } from '../../icons'
import { useT } from '../../i18n'
import type { InspectPanelId } from '../../lib/inspectPanelIds'
import { usePanelWidth } from '../../lib/usePanelWidth'

export type { InspectPanelId }

type InspectPanelShellProps = {
  panelId: InspectPanelId
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function InspectPanelShell({
  panelId,
  title,
  open,
  onClose,
  children,
}: InspectPanelShellProps) {
  const t = useT()
  const { width, onResizePointerDown } = usePanelWidth(panelId)

  if (!open) return null

  return (
    <div className="inspect-panel" style={{ width }}>
      <div className="inspect-panel-header">
        <span className="inspect-panel-title">{title}</span>
        <IconButton size="small" onClick={onClose} aria-label={t('common.close')}>
          <Icon icon="material-symbols:close" aria-hidden />
        </IconButton>
      </div>
      <div className="inspect-panel-body">{children}</div>
      <div
        className="inspect-resize-handle"
        onPointerDown={onResizePointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('common.resizePanel')}
      />
    </div>
  )
}
