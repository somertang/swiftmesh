import type { InspectPanelId } from './inspectPanelIds'

export type SurfaceToolId = 'annotate' | 'measure'
export type ViewportToolId = InspectPanelId | SurfaceToolId

const INSPECT_PANEL_IDS: ReadonlySet<string> = new Set([
  'hierarchy',
  'textures',
  'materials',
  'geometries',
  'info',
  'decimate',
])

export function isInspectPanelId(id: ViewportToolId | null): id is InspectPanelId {
  return id != null && INSPECT_PANEL_IDS.has(id)
}

export function isSurfaceToolId(id: ViewportToolId | null): id is SurfaceToolId {
  return id === 'annotate' || id === 'measure'
}
