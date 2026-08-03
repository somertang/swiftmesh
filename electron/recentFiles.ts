import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_MAX_RECENT_MODELS = 10
export const MIN_MAX_RECENT_MODELS = 5
export const MAX_MAX_RECENT_MODELS = 30

/** @deprecated Prefer DEFAULT_MAX_RECENT_MODELS + store.max */
export const MAX_RECENT_MODELS = DEFAULT_MAX_RECENT_MODELS

type RecentStore = {
  paths: string[]
  max?: number
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

function clampMax(value: unknown, fallback = DEFAULT_MAX_RECENT_MODELS): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(
    MAX_MAX_RECENT_MODELS,
    Math.max(MIN_MAX_RECENT_MODELS, Math.round(n))
  )
}

async function readStore(): Promise<RecentStore> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<RecentStore>
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : []
    return {
      paths,
      max: parsed.max !== undefined ? clampMax(parsed.max) : undefined,
    }
  } catch {
    return { paths: [] }
  }
}

async function writeStore(store: RecentStore): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true })
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8')
}

function resolveMax(store: RecentStore): number {
  return store.max !== undefined ? clampMax(store.max) : DEFAULT_MAX_RECENT_MODELS
}

export async function loadRecentPaths(): Promise<string[]> {
  const store = await readStore()
  return store.paths.slice(0, resolveMax(store))
}

export async function setRecentMax(max: number): Promise<string[]> {
  const store = await readStore()
  const nextMax = clampMax(max)
  const paths = store.paths.slice(0, nextMax)
  await writeStore({ paths, max: nextMax })
  return paths
}

export async function addRecentPath(filePath: string): Promise<string[]> {
  if (!filePath || !isAbsoluteModelPath(filePath)) {
    return loadRecentPaths()
  }
  const normalized = normalizeRecentPath(filePath)
  const store = await readStore()
  const max = resolveMax(store)
  const next = [normalized, ...store.paths.filter(p => !pathsEqual(p, normalized))].slice(0, max)
  await writeStore({ paths: next, max: store.max ?? max })
  return next
}

export async function removeRecentPath(filePath: string): Promise<string[]> {
  const store = await readStore()
  const next = store.paths.filter(p => !pathsEqual(p, filePath))
  await writeStore({ paths: next, max: store.max })
  return next.slice(0, resolveMax({ ...store, paths: next }))
}

export async function clearRecentPaths(): Promise<string[]> {
  const store = await readStore()
  await writeStore({ paths: [], max: store.max })
  return []
}
