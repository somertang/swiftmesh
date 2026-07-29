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
    <div className="inspect-panel card bg-base-200/95 shadow-lg" style={{ width }}>
      <div className="inspect-panel-header flex items-center justify-between gap-2 border-b border-base-300 px-3 py-2">
        <span className="inspect-panel-title text-sm font-semibold">{title}</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Icon icon="material-symbols:close" aria-hidden />
        </button>
      </div>
      <div className="inspect-panel-body card-body p-2">{children}</div>
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
