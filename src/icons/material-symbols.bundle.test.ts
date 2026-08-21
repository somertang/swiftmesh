import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICON_REF_RE = /material-symbols:([a-z0-9-]+)/g

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(full, out)
      continue
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue
    if (entry.name === 'material-symbols.json') continue
    out.push(full)
  }
  return out
}

describe('offline material-symbols bundle', () => {
  it('registers every material-symbols icon referenced in src', () => {
    const collectionPath = path.join(srcRoot, 'icons', 'material-symbols.json')
    const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8')) as {
      icons: Record<string, { body?: string }>
    }
    const registered = new Set(Object.keys(collection.icons ?? {}))

    const used = new Set<string>()
    for (const file of collectSourceFiles(srcRoot)) {
      // Skip the bundle itself and this test file's string literals about missing names.
      if (file.endsWith(`${path.sep}icons${path.sep}material-symbols.json`)) continue
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(ICON_REF_RE)) {
        used.add(match[1]!)
      }
    }

    const missing = [...used].filter((name) => !registered.has(name)).sort()
    expect(missing, `Unregistered offline icons: ${missing.join(', ')}`).toEqual([])
  })
})
