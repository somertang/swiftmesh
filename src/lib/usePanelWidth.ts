import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { type InspectPanelId } from './inspectPanelIds'

/** Session-only remembered widths (survives panel close/reopen, not page refresh). */
const sessionWidths = new Map<InspectPanelId, number>()

export const PANEL_WIDTH_DEFAULTS: Record<InspectPanelId, number> = {
  hierarchy: 280,
  textures: 340,
  materials: 340,
  geometries: 560,
  info: 280,
  decimate: 340,
}

const PANEL_WIDTH_MIN = 220
const PANEL_WIDTH_MAX = 720

export function usePanelWidth(panelId: InspectPanelId) {
  const [width, setWidth] = useState(
    () => sessionWidths.get(panelId) ?? PANEL_WIDTH_DEFAULTS[panelId]
  )

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = width
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          PANEL_WIDTH_MAX,
          Math.max(PANEL_WIDTH_MIN, startWidth + (ev.clientX - startX))
        )
        sessionWidths.set(panelId, next)
        setWidth(next)
      }

      const onUp = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId)
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onUp)
      }

      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onUp)
    },
    [panelId, width]
  )

  return { width, onResizePointerDown }
}
