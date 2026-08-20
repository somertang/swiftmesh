import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import { Icon } from '../icons'
import { useT, type MessageKey } from '../i18n'
import type { InspectPanelId } from './inspect/InspectPanelShell'
import { AnnotateToolIcon, MeasureToolIcon } from './ViewportToolIcons'
import type { ViewportToolId } from '../lib/viewportTools'

const INSPECT_TOOLS: {
  id: InspectPanelId
  labelKey: MessageKey
  icon: string
}[] = [
  { id: 'hierarchy', labelKey: 'tool.hierarchy', icon: 'material-symbols:account-tree' },
  { id: 'textures', labelKey: 'tool.textures', icon: 'material-symbols:texture' },
  { id: 'materials', labelKey: 'tool.materials', icon: 'material-symbols:palette' },
  { id: 'geometries', labelKey: 'tool.geometries', icon: 'material-symbols:deployed-code' },
  { id: 'info', labelKey: 'tool.info', icon: 'material-symbols:info' },
  { id: 'decimate', labelKey: 'tool.decimate', icon: 'material-symbols:compress' },
]

const INSPECT_ASSET_TOOLS = new Set<InspectPanelId>(['textures', 'materials', 'geometries', 'info'])

type ViewportToolbarProps = {
  active: ViewportToolId | null
  onToggle: (id: ViewportToolId) => void
  disabled?: boolean
  allowInspectAssets?: boolean
}

export function ViewportToolbar({
  active,
  onToggle,
  disabled,
  allowInspectAssets = true,
}: ViewportToolbarProps) {
  const t = useT()
  return (
    <Paper
      className="viewport-toolbar"
      elevation={0}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('toolbar.aria')}
      sx={{ bgcolor: 'transparent', backgroundImage: 'none' }}
    >
      {INSPECT_TOOLS.map(tool => {
        const isActive = active === tool.id
        const label = t(tool.labelKey)
        const toolDisabled = disabled || (!allowInspectAssets && INSPECT_ASSET_TOOLS.has(tool.id))
        return (
          <IconButton
            key={tool.id}
            className={isActive ? 'is-active' : undefined}
            color={isActive ? 'primary' : 'default'}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            disabled={toolDisabled}
            onClick={() => onToggle(tool.id)}
          >
            <Icon icon={tool.icon} aria-hidden />
          </IconButton>
        )
      })}
      <span className="viewport-toolbar-sep" aria-hidden />
      <IconButton
        className={active === 'annotate' ? 'is-active' : undefined}
        color={active === 'annotate' ? 'primary' : 'default'}
        title={t('tool.annotate')}
        aria-label={t('tool.annotate')}
        aria-pressed={active === 'annotate'}
        disabled={disabled}
        onClick={() => onToggle('annotate')}
      >
        <AnnotateToolIcon />
      </IconButton>
      <IconButton
        className={active === 'measure' ? 'is-active' : undefined}
        color={active === 'measure' ? 'primary' : 'default'}
        title={t('tool.measure')}
        aria-label={t('tool.measure')}
        aria-pressed={active === 'measure'}
        disabled={disabled}
        onClick={() => onToggle('measure')}
      >
        <MeasureToolIcon />
      </IconButton>
    </Paper>
  )
}
