/** Lightweight cross-pane tab-drag signal for drop indicators. */

export type TabDragPointer = {
  sourceGroupId: string
  tabId: string
  clientX: number
  clientY: number
}

type Listener = (pointer: TabDragPointer | null) => void

const listeners = new Set<Listener>()
let current: TabDragPointer | null = null

export function publishTabDrag(pointer: TabDragPointer | null): void {
  current = pointer
  for (const listener of listeners) listener(current)
}

export function subscribeTabDrag(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}

export function findEditorGroupIdAtPoint(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY)
  const bar = el?.closest<HTMLElement>('[data-editor-group-id]')
  return bar?.dataset.editorGroupId ?? null
}
