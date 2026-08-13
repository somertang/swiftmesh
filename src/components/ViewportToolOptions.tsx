import { useT } from '../i18n'
import { isSurfaceToolId, type ViewportToolId } from '../lib/viewportTools'

export const ANNOTATE_COLORS = ['#EA334C', '#EC7700', '#F0C000', '#47A559', '#3D7DFF', '#FFFFFF']

type ViewportToolOptionsProps = {
  active: ViewportToolId | null
  annotateColor: string
  onAnnotateColorChange: (color: string) => void
  canClearAnnotate: boolean
  canClearMeasure: boolean
  onClearAnnotate: () => void
  onClearMeasure: () => void
}

export function ViewportToolOptions({
  active,
  annotateColor,
  onAnnotateColorChange,
  canClearAnnotate,
  canClearMeasure,
  onClearAnnotate,
  onClearMeasure,
}: ViewportToolOptionsProps) {
  const t = useT()
  if (!isSurfaceToolId(active)) return null

  return (
    <div className="viewport-tool-options" role="toolbar" aria-label={t(active === 'annotate' ? 'tool.annotate' : 'tool.measure')}>
      <span>{t(active === 'annotate' ? 'tool.annotate.hint' : 'tool.measure.hint')}</span>
      {active === 'annotate' ? (
        <div className="viewport-tool-swatches" role="group" aria-label={t('tool.annotate.color')}>
          {ANNOTATE_COLORS.map(color => (
            <button
              key={color}
              type="button"
              className={`viewport-tool-swatch${annotateColor === color ? ' is-active' : ''}`}
              style={{ background: color }}
              title={color}
              aria-label={color}
              aria-pressed={annotateColor === color}
              onClick={() => onAnnotateColorChange(color)}
            />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="viewport-tool-clear ghost"
        disabled={active === 'annotate' ? !canClearAnnotate : !canClearMeasure}
        onClick={active === 'annotate' ? onClearAnnotate : onClearMeasure}
      >
        {t(active === 'annotate' ? 'tool.annotate.clear' : 'tool.measure.clear')}
      </button>
    </div>
  )
}
