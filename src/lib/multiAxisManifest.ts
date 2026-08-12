import type { RecordingImageFormat } from '../desktopTypes'
import { imageExtension } from './recordingPresets'
import type { AtlasPackPreview } from './atlasLayout'

export type PitchLevelSheetEntry = {
  url: string
  cols: number
  rows: number
  frameCount: number
}

export type PitchLevelSheet = {
  pitchAngle: number
  /** Relative primary atlas filename (atlas_01 when multi-sheet). */
  url: string
  cols: number
  rows: number
  frameCount: number
  sheets: PitchLevelSheetEntry[]
}

export type MultiAxisManifest = {
  stem: string
  available: true
  defaultPitchIndex: number
  yawColumns: number
  pitchAngles: number[]
  sourceWidth: number
  sourceHeight: number
  imageFormat: RecordingImageFormat
  atlasMaxEdge: number
  levels: PitchLevelSheet[]
}

export const DEFAULT_PITCH_ANGLES = [-15, 0, 25, 50, 75] as const

/** Format pitch for filenames: 0 → "0", 25 → "25", -15 → "-15". */
export function formatPitchForFilename(pitch: number): string {
  const n = Math.round(pitch)
  return String(n)
}

export function parsePitchAnglesText(raw: string): number[] | null {
  const parts = raw
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const angles: number[] = []
  for (const part of parts) {
    const n = Number(part)
    if (!Number.isFinite(n)) return null
    angles.push(n)
  }
  return angles
}

export function pitchAnglesToText(angles: number[]): string {
  return angles.join(', ')
}

export function defaultPitchIndex(pitchAngles: number[]): number {
  let best = 0
  let bestAbs = Number.POSITIVE_INFINITY
  for (let i = 0; i < pitchAngles.length; i++) {
    const abs = Math.abs(pitchAngles[i]!)
    if (abs < bestAbs) {
      bestAbs = abs
      best = i
    }
  }
  return best
}

/**
 * Build one pitch level from packing preview + stem + format.
 * Sheet file names match electron `finishImagesExport` naming.
 */
export function buildPitchLevelFromPreview(
  pitchAngle: number,
  stem: string,
  imageFormat: RecordingImageFormat,
  preview: AtlasPackPreview,
  yawFrameCount: number
): PitchLevelSheet {
  const ext = imageExtension(imageFormat)
  const sheets: PitchLevelSheetEntry[] = preview.sheets.map((sheet, index) => {
    const n = String(index + 1).padStart(2, '0')
    return {
      url: `${stem}_atlas_${n}.${ext}`,
      cols: sheet.cols,
      rows: sheet.rows,
      frameCount: sheet.frameCount,
    }
  })
  const primary = sheets[0]
  return {
    pitchAngle,
    url: primary?.url ?? `${stem}_atlas_01.${ext}`,
    cols: primary?.cols ?? 1,
    rows: primary?.rows ?? 1,
    frameCount: yawFrameCount,
    sheets,
  }
}

export function buildMultiAxisManifest(options: {
  /** Base stem without pitch suffix, e.g. Model-turntable_pc-720p_high */
  baseStem: string
  pitchAngles: number[]
  levels: PitchLevelSheet[]
  yawColumns: number
  sourceWidth: number
  sourceHeight: number
  imageFormat: RecordingImageFormat
  atlasMaxEdge: number
}): MultiAxisManifest {
  return {
    stem: options.baseStem,
    available: true,
    defaultPitchIndex: defaultPitchIndex(options.pitchAngles),
    yawColumns: options.yawColumns,
    pitchAngles: [...options.pitchAngles],
    sourceWidth: options.sourceWidth,
    sourceHeight: options.sourceHeight,
    imageFormat: options.imageFormat,
    atlasMaxEdge: options.atlasMaxEdge,
    levels: options.levels,
  }
}

/** Extract allocated stem from a finished atlas path like `…/foo_pitch-15_atlas_01.webp`. */
export function stemFromAtlasPath(atlasPath: string): string | null {
  const base = atlasPath.replace(/\\/g, '/').split('/').pop() ?? ''
  const m = base.match(/^(.*)_atlas_\d+\.(png|jpg|jpeg|webp)$/i)
  return m?.[1] ?? null
}
