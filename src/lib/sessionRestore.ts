export const SESSION_STORAGE_KEY = 'swiftmesh.session'

export type SessionSnapshot = {
  /** Absolute model paths in open order (tabs with no path are omitted). */
  modelPaths: string[]
}

function isAbsoluteModelPath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\')
}

function isPersistablePath(filePath: string | null | undefined): filePath is string {
  const raw = filePath?.trim()
  return Boolean(raw && isAbsoluteModelPath(raw))
}

export function readSession(): SessionSnapshot {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return { modelPaths: [] }
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>
    const modelPaths = Array.isArray(parsed.modelPaths)
      ? parsed.modelPaths.filter((p): p is string => typeof p === 'string' && isPersistablePath(p))
      : []
    return { modelPaths }
  } catch {
    return { modelPaths: [] }
  }
}

export function writeSession(snapshot: SessionSnapshot) {
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        modelPaths: snapshot.modelPaths.filter(p => isPersistablePath(p)),
      } satisfies SessionSnapshot)
    )
  } catch {
    /* ignore */
  }
}

export function captureSessionFromTabs(
  tabs: { model?: { path: string | null } | null }[]
): SessionSnapshot {
  const modelPaths: string[] = []
  for (const tab of tabs) {
    const path = tab.model?.path
    if (isPersistablePath(path)) modelPaths.push(path)
  }
  return { modelPaths }
}
