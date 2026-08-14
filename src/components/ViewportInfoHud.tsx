import type { CameraProjection } from '../config/cameraDefaults'
import { useT } from '../i18n'
import { formatViewZoomPercent } from '../lib/cameraFocus'
import { formatUnitScaleFactor } from '../lib/modelDisplayScale'

type ViewportInfoHudProps = {
  projection: CameraProjection
  viewZoom: number | null
  unitScale: number | null
  shiftDown?: boolean
}

export function ViewportInfoHud({
  projection,
  viewZoom,
  unitScale,
  shiftDown = false,
}: ViewportInfoHudProps) {
  const t = useT()
  const projectionLabel = t(
    projection === 'orthographic' ? 'hud.projection.orthographic' : 'hud.projection.perspective'
  )
  const details: string[] = []
  if (viewZoom != null) details.push(t('hud.viewZoom', { value: formatViewZoomPercent(viewZoom) }))
  if (unitScale != null) details.push(t('hud.unitScale', { value: formatUnitScaleFactor(unitScale) }))

  return (
    <div
      className={`viewport-info-hud${shiftDown ? ' is-shifted' : ''}`}
      role="status"
      aria-label={[projectionLabel, ...details].join(', ')}
    >
      <div>{projectionLabel}</div>
      {details.length > 0 ? <div>{details.join(' · ')}</div> : null}
    </div>
  )
}
