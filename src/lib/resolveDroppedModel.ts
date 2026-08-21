import type { OpenModelResult } from '../desktopTypes'

export type ResolvedModelDrop =
  | { mode: 'desktop'; result: OpenModelResult }
  | { mode: 'browser'; files: File[]; nativePath: string | null }

/**
 * Resolve a drag-and-drop FileList the same way the main viewport does:
 * single desktop file with a native path → readModelPath; otherwise browser files.
 */
export async function resolveDroppedModelFiles(
  files: FileList | File[] | null | undefined
): Promise<ResolvedModelDrop | null> {
  const list = files ? Array.from(files) : []
  if (list.length === 0) return null

  const first = list[0]!
  const nativePath = window.desktop?.getPathForFile?.(first) || null
  if (nativePath && window.desktop?.readModelPath && list.length === 1) {
    const result = await window.desktop.readModelPath(nativePath)
    return { mode: 'desktop', result }
  }
  return { mode: 'browser', files: list, nativePath }
}
