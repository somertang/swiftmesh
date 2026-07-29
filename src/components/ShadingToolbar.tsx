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
      <button
        key={item.id}
        type="button"
        className={`btn btn-square btn-sm${embedded ? ' join-item' : ''}${active ? ' btn-active btn-primary' : ' btn-ghost'}`}
        title={label}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={() => onChange(item.id)}
      >
        <Icon icon={item.icon} aria-hidden />
      </button>
    )
  })

  if (embedded) {
    return <>{buttons}</>
  }

  return (
    <div className="shading-toolbar join" role="toolbar" aria-label={t('shading.aria')}>
      {buttons}
    </div>
  )
}
