import ButtonGroup from '@mui/material/ButtonGroup'
import IconButton from '@mui/material/IconButton'
import { Icon } from '../icons'
import { useT } from '../i18n'
import type { ShadingMode } from '../lib/shadingMode'

const MODES: {
  id: ShadingMode
  labelKey: 'shading.wireframe' | 'shading.solid' | 'shading.material'
  icon: string
}[] = [
  { id: 'wireframe', labelKey: 'shading.wireframe', icon: 'material-symbols:blur-circular-outline' },
  { id: 'solid', labelKey: 'shading.solid', icon: 'material-symbols:circle' },
  { id: 'material', labelKey: 'shading.material', icon: 'material-symbols:contrast' },
]

type ShadingToolbarProps = {
  mode: ShadingMode
  onChange: (mode: ShadingMode) => void
  disabled?: boolean
  /** When true, render only buttons (no floating chrome) for embedding in a parent toolbar. */
  embedded?: boolean
}

export function ShadingToolbar({ mode, onChange, disabled, embedded }: ShadingToolbarProps) {
  const t = useT()
  const buttons = MODES.map(item => {
    const label = t(item.labelKey)
    const active = mode === item.id
    return (
      <IconButton
        key={item.id}
        color={active ? 'primary' : 'default'}
        title={label}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={() => onChange(item.id)}
      >
        <Icon icon={item.icon} aria-hidden />
      </IconButton>
    )
  })

  if (embedded) {
    return <>{buttons}</>
  }

  return (
    <ButtonGroup className="shading-toolbar" role="toolbar" aria-label={t('shading.aria')}>
      {buttons}
    </ButtonGroup>
  )
}
