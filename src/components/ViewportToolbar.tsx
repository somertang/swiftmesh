import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import type React from 'react'
import { Icon } from '../icons'
import { useT, type MessageKey } from '../i18n'
import type { InspectPanelId } from './inspect/InspectPanelShell'
import {
  AnnotateToolIcon,
  MeasureToolIcon,
  RotateToolIcon,
  ScaleToolIcon,
  SelectToolIcon,
  TranslateToolIcon,
} from './ViewportToolIcons'
import type { TransformToolId, ViewportInteractionToolId } from '../lib/viewportTools'

const TRANSFORM_TOOLS: {
  id: TransformToolId
  labelKey: MessageKey
  Icon: () => React.ReactElement
}[] = [
  { id: 'select', labelKey: 'tool.select', Icon: SelectToolIcon },
  { id: 'translate', labelKey: 'tool.translate', Icon: TranslateToolIcon },
  { id: 'rotate', labelKey: 'tool.rotate', Icon: RotateToolIcon },
  { id: 'scale', labelKey: 'tool.scale', Icon: ScaleToolIcon },
]

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
  activeInspect: InspectPanelId | null
  activeInteraction: ViewportInteractionToolId | null
  onToggleInspect: (id: InspectPanelId) => void
  onToggleInteraction: (id: ViewportInteractionToolId) => void
  disabled?: boolean
  allowInspectAssets?: boolean
}

export function ViewportToolbar({
  activeInspect,
  activeInteraction,
  onToggleInspect,
  onToggleInteraction,
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
      {TRANSFORM_TOOLS.map(tool => {
        const isActive = activeInteraction === tool.id
        const label = t(tool.labelKey)
        const ToolIcon = tool.Icon
        return (
          <IconButton
            key={tool.id}
            className={isActive ? 'is-active' : undefined}
            color={isActive ? 'primary' : 'default'}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onToggleInteraction(tool.id)}
          >
            <ToolIcon />
          </IconButton>
        )
      })}
      <span className="viewport-toolbar-sep" aria-hidden />
      {INSPECT_TOOLS.map(tool => {
        const isActive = activeInspect === tool.id
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
            onClick={() => onToggleInspect(tool.id)}
          >
            <Icon icon={tool.icon} aria-hidden />
          </IconButton>
        )
      })}
      <span className="viewport-toolbar-sep" aria-hidden />
      <IconButton
        className={activeInteraction === 'annotate' ? 'is-active' : undefined}
        color={activeInteraction === 'annotate' ? 'primary' : 'default'}
        title={t('tool.annotate')}
        aria-label={t('tool.annotate')}
        aria-pressed={activeInteraction === 'annotate'}
        disabled={disabled}
        onClick={() => onToggleInteraction('annotate')}
      >
        <AnnotateToolIcon />
      </IconButton>
      <IconButton
        className={activeInteraction === 'measure' ? 'is-active' : undefined}
        color={activeInteraction === 'measure' ? 'primary' : 'default'}
        title={t('tool.measure')}
        aria-label={t('tool.measure')}
        aria-pressed={activeInteraction === 'measure'}
        disabled={disabled}
        onClick={() => onToggleInteraction('measure')}
      >
        <MeasureToolIcon />
      </IconButton>
    </Paper>
  )
}
