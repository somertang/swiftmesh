import { Icon } from '../icons'
import { useT } from '../i18n'
import type { InspectPanelId } from './inspect/InspectPanelShell'

const TOOLS: {
  id: InspectPanelId
  labelKey: 'tool.hierarchy' | 'tool.textures' | 'tool.materials' | 'tool.geometries' | 'tool.info'
  icon: string
}[] = [
  { id: 'hierarchy', labelKey: 'tool.hierarchy', icon: 'material-symbols:account-tree' },
  { id: 'textures', labelKey: 'tool.textures', icon: 'material-symbols:texture' },
  { id: 'materials', labelKey: 'tool.materials', icon: 'material-symbols:palette' },
  { id: 'geometries', labelKey: 'tool.geometries', icon: 'material-symbols:deployed-code' },
  { id: 'info', labelKey: 'tool.info', icon: 'material-symbols:info' },
]

type ViewportToolbarProps = {
  active: InspectPanelId | null
  onToggle: (id: InspectPanelId) => void
  disabled?: boolean
}

export function ViewportToolbar({ active, onToggle, disabled }: ViewportToolbarProps) {
  const t = useT()
  return (
    <div className="viewport-toolbar join join-vertical" role="toolbar" aria-label={t('toolbar.aria')}>
      {TOOLS.map(tool => {
        const isActive = active === tool.id
        const label = t(tool.labelKey)
        return (
          <button
            key={tool.id}
            type="button"
            className={`btn btn-square btn-sm join-item${isActive ? ' btn-active btn-primary' : ' btn-ghost'}`}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onToggle(tool.id)}
          >
            <Icon icon={tool.icon} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
