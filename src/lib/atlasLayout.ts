import type { AtlasPackMode } from '../desktopTypes'

/** Default max atlas edge length (GPU-safe power-of-two friendly). */
export const ATLAS_MAX_EDGE_DEFAULT = 8192

export const ATLAS_MAX_EDGE_PRESETS = [2048, 4096, 8192] as const

export function atlasLayout(tileW: number, tileH: number, frameCount: number, maxEdge: number) {
  if (tileW > maxEdge || tileH > maxEdge) {
    throw new Error(
      `Frame size ${tileW}×${tileH} exceeds atlas max edge ${maxEdge}. Lower recording size.`
    )
  }

  const colsMax = Math.max(1, Math.floor(maxEdge / tileW))
  const rowsMax = Math.max(1, Math.floor(maxEdge / tileH))
  const tilesPerSheet = colsMax * rowsMax
  const sheetCount = Math.ceil(frameCount / tilesPerSheet)

  return { colsMax, rowsMax, tilesPerSheet, sheetCount }
}

/** Near-square grid for packing `count` tiles onto one sheet. */
export function singleSheetGrid(count: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))
  return { cols, rows }
}

export type AtlasSheetPreview = {
  cols: number
  rows: number
  frameCount: number
  canvasW: number
  canvasH: number
}

export type AtlasPackPreview = {
  packMode: AtlasPackMode
  sheetCount: number
  tilesPerSheet: number
  scale: number
  downscaled: boolean
  effectiveTileW: number
  effectiveTileH: number
  sheets: AtlasSheetPreview[]
  /** Human-readable one-line summary. */
  summary: string
  warning: string | null
}

/**
 * Predict atlas packing outcome without encoding (for UI preview).
 * Matches electron/recordingImages preserve / fitSingle layout rules.
 */
export function previewAtlasPack(options: {
  tileW: number
  tileH: number
  frameCount: number
  packMode: AtlasPackMode
  maxEdge?: number
}): AtlasPackPreview {
  const tileW = Math.max(1, Math.round(options.tileW))
  const tileH = Math.max(1, Math.round(options.tileH))
  const frameCount = Math.max(1, Math.round(options.frameCount))
  const maxEdge = Math.max(1, options.maxEdge ?? ATLAS_MAX_EDGE_DEFAULT)
  const packMode = options.packMode

  if (tileW > maxEdge || tileH > maxEdge) {
    return {
      packMode,
      sheetCount: 0,
      tilesPerSheet: 0,
      scale: 0,
      downscaled: true,
      effectiveTileW: tileW,
      effectiveTileH: tileH,
      sheets: [],
      summary: `Frame ${tileW}×${tileH} exceeds max edge ${maxEdge}`,
      warning: `Lower recording size or raise atlas max edge (currently ${maxEdge}).`,
    }
  }

  if (packMode === 'fitSingle') {
    const { cols, rows } = singleSheetGrid(frameCount)
    const fullW = cols * tileW
    const fullH = rows * tileH
    const scale = Math.min(1, maxEdge / fullW, maxEdge / fullH)
    const effectiveTileW = Math.max(1, Math.floor(tileW * scale))
    const effectiveTileH = Math.max(1, Math.floor(tileH * scale))
    const canvasW = cols * effectiveTileW
    const canvasH = rows * effectiveTileH
    const downscaled = scale < 0.999
    return {
      packMode,
      sheetCount: 1,
      tilesPerSheet: frameCount,
      scale,
      downscaled,
      effectiveTileW,
      effectiveTileH,
      sheets: [{ cols, rows, frameCount, canvasW, canvasH }],
      summary: `1 sheet · ${cols}×${rows} · ${canvasW}×${canvasH}${
        downscaled ? ` · scaled ${(scale * 100).toFixed(0)}%` : ' · no downscale'
      }`,
      warning: downscaled
        ? `Fit single will shrink tiles from ${tileW}×${tileH} to ${effectiveTileW}×${effectiveTileH}. Use Preserve to keep native resolution.`
        : null,
    }
  }

  const { colsMax, rowsMax, tilesPerSheet, sheetCount } = atlasLayout(
    tileW,
    tileH,
    frameCount,
    maxEdge
  )
  const sheets: AtlasSheetPreview[] = []
  for (let sheet = 0; sheet < sheetCount; sheet++) {
    const start = sheet * tilesPerSheet
    const end = Math.min(frameCount, start + tilesPerSheet)
    const count = end - start
    const cols = Math.min(colsMax, Math.max(1, Math.ceil(Math.sqrt(count))))
    const rows = Math.min(rowsMax, Math.ceil(count / cols))
    sheets.push({
      cols,
      rows,
      frameCount: count,
      canvasW: cols * tileW,
      canvasH: rows * tileH,
    })
  }

  const first = sheets[0]
  const gridHint = first ? `${first.cols}×${first.rows}` : '—'
  const sizeHint = first ? `${first.canvasW}×${first.canvasH}` : '—'
  return {
    packMode,
    sheetCount,
    tilesPerSheet,
    scale: 1,
    downscaled: false,
    effectiveTileW: tileW,
    effectiveTileH: tileH,
    sheets,
    summary: `${sheetCount} sheet${sheetCount === 1 ? '' : 's'} · ${gridHint} · ${sizeHint} · no downscale`,
    warning: null,
  }
}

export function clampAtlasMaxEdge(value: unknown, fallback = ATLAS_MAX_EDGE_DEFAULT): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(256, Math.min(16384, Math.round(n)))
}
