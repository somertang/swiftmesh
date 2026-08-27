import type { InspectPanelId } from './inspectPanelIds'
import type { TransformMode, TransformToolId } from './transform/transformTypes'

export type SurfaceToolId = 'annotate' | 'measure'
export type ViewportInteractionToolId = TransformToolId | SurfaceToolId
/** @deprecated Prefer InspectPanelId | ViewportInteractionToolId separately. */
export type ViewportToolId = InspectPanelId | ViewportInteractionToolId

const INSPECT_PANEL_IDS: ReadonlySet<string> = new Set([
  'hierarchy',
  'textures',
  'materials',
  'geometries',
  'info',
  'decimate',
])

const TRANSFORM_TOOL_IDS: ReadonlySet<string> = new Set([
  'select',
  'translate',
  'rotate',
  'scale',
])

export function isInspectPanelId(id: string | null): id is InspectPanelId {
  return id != null && INSPECT_PANEL_IDS.has(id)
}

export function isSurfaceToolId(id: string | null): id is SurfaceToolId {
  return id === 'annotate' || id === 'measure'
}

export function isTransformToolId(id: string | null): id is TransformToolId {
  return id != null && TRANSFORM_TOOL_IDS.has(id)
}

export function isTransformMode(id: string | null): id is TransformMode {
  return id === 'translate' || id === 'rotate' || id === 'scale'
}

export type { TransformMode, TransformToolId }
