import type { Object3D } from 'three'

/** Pointer travel at or under this many pixels is a click; past it is an orbit drag. */
export const VIEWPORT_CLICK_MAX_MOVE_PX = 10

export type PointerSample = {
  x: number
  y: number
}

/**
 * Click vs orbit-drag, by pointer movement only.
 * A missing pointerdown (orbit ate the event) is not a click.
 */
export function isViewportClick(
  down: PointerSample | null,
  up: PointerSample,
  maxMovePx = VIEWPORT_CLICK_MAX_MOVE_PX
): boolean {
  if (!down) return false
  const dx = up.x - down.x
  const dy = up.y - down.y
  return dx * dx + dy * dy <= maxMovePx * maxMovePx
}

/**
 * Map a raycast hit to the hierarchy node it belongs to.
 * Skip `__hierarchyIgnore` helpers and walk parents until a `__hierId` mesh/node.
 * A miss (no object, or no hierarchy ancestor) returns null so selection can clear.
 */
export function hierarchyMeshFromHit(object: Object3D | null): Object3D | null {
  let current: Object3D | null = object
  while (current) {
    if (current.userData.__hierarchyIgnore) {
      current = current.parent
      continue
    }
    if (typeof current.userData.__hierId === 'string') return current
    current = current.parent
  }
  return null
}
