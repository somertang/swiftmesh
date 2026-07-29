import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

export const MAX_RECENT_MODELS = 10

type RecentStore = {
  paths: string[]
}

function storePath() {
  return path.join(app.getPath('userData'), 'recent-models.json')
}

function normalizeRecentPath(filePath: string): string {
  return path.normalize(filePath.trim())
}

function pathsEqual(a: string, b: string): boolean {
  const na = normalizeRecentPath(a)
  const nb = normalizeRecentPath(b)
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}

function isAbsoluteModelPath(filePath: string): boolean {
  return path.isAbsolute(filePath)
}

async function readStore(): Promise<RecentStore> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<RecentStore>
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : []
    return { paths }
  } catch {
    return { paths: [] }
  }
}

async function writeStore(store: RecentStore): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true })
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8')
}

export async function loadRecentPaths(): Promise<string[]> {
  const store = await readStore()
  return store.paths.slice(0, MAX_RECENT_MODELS)
}

export async function addRecentPath(filePath: string): Promise<string[]> {
  if (!filePath || !isAbsoluteModelPath(filePath)) {
    return loadRecentPaths()
  }
  const normalized = normalizeRecentPath(filePath)
  const store = await readStore()
  const next = [normalized, ...store.paths.filter(p => !pathsEqual(p, normalized))].slice(
    0,
    MAX_RECENT_MODELS
  )
  await writeStore({ paths: next })
  return next
}

export async function removeRecentPath(filePath: string): Promise<string[]> {
  const store = await readStore()
  const next = store.paths.filter(p => !pathsEqual(p, filePath))
  await writeStore({ paths: next })
  return next
}

export async function clearRecentPaths(): Promise<string[]> {
  await writeStore({ paths: [] })
  return []
}
