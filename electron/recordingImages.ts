import fs from 'node:fs/promises'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import sharp from 'sharp'
import yazl from 'yazl'
import type {
  AtlasPackMode,
  RecordingImageFormat,
  RecordingImagesOptions,
} from '../src/desktopTypes'
import {
  ATLAS_MAX_EDGE_DEFAULT,
  atlasLayout,
  singleSheetGrid,
} from '../src/lib/atlasLayout'
import {
  DEFAULT_FLATTEN_COLOR,
  flattenColorToRgb,
  needsExportMask,
} from '../src/lib/recordingPresets'

/** @deprecated Prefer ATLAS_MAX_EDGE_DEFAULT from src/lib/atlasLayout */
export const ATLAS_MAX_EDGE = ATLAS_MAX_EDGE_DEFAULT

export function imageFileExtension(format: RecordingImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format
}

function framePngPath(framesDir: string, index: number): string {
  return path.join(framesDir, `frame_${String(index).padStart(6, '0')}.png`)
}

function frameMaskPngPath(masksDir: string, index: number): string {
  return path.join(masksDir, `frame_${String(index).padStart(6, '0')}_mask.png`)
}

function jpegFlattenRgb(imageFlattenColor?: string): { r: number; g: number; b: number } {
  return flattenColorToRgb(imageFlattenColor ?? DEFAULT_FLATTEN_COLOR)
}

async function encodeImageBuffer(
  inputPath: string,
  format: RecordingImageFormat,
  quality: number,
  exportBackground: boolean,
  imageFlattenColor?: string
): Promise<Buffer> {
  let pipeline = sharp(inputPath)
  switch (format) {
    case 'jpeg':
      if (!exportBackground) {
        pipeline = pipeline.flatten({ background: jpegFlattenRgb(imageFlattenColor) })
      }
      pipeline = pipeline.jpeg({ quality, mozjpeg: true })
      break
    case 'webp':
      pipeline = pipeline.webp({ quality })
      break
    case 'png':
    default:
      pipeline = pipeline.png()
      break
  }
  return pipeline.toBuffer()
}

function applyAtlasEncode(
  pipeline: sharp.Sharp,
  imageFormat: RecordingImageFormat,
  imageQuality: number,
  exportBackground: boolean,
  imageFlattenColor?: string
): sharp.Sharp {
  switch (imageFormat) {
    case 'jpeg':
      pipeline = pipeline.flatten({
        background: exportBackground ? { r: 0, g: 0, b: 0 } : jpegFlattenRgb(imageFlattenColor),
      })
      return pipeline.jpeg({ quality: imageQuality, mozjpeg: true })
    case 'webp':
      return pipeline.webp({ quality: imageQuality })
    case 'png':
    default:
      return pipeline.png()
  }
}

export async function writeConvertedFrames(options: {
  framesDir: string
  masksDir?: string
  frameCount: number
  outputDir: string
  imageFormat: RecordingImageFormat
  imageQuality: number
  exportBackground: boolean
  imageFlattenColor?: string
  onProgress?: (percent: number) => void
}): Promise<string[]> {
  const {
    framesDir,
    masksDir,
    frameCount,
    outputDir,
    imageFormat,
    imageQuality,
    exportBackground,
    imageFlattenColor,
    onProgress,
  } = options
  await fs.mkdir(outputDir, { recursive: true })
  const ext = imageFileExtension(imageFormat)
  const written: string[] = []

  for (let i = 0; i < frameCount; i++) {
    const src = framePngPath(framesDir, i)
    const dest = path.join(outputDir, `frame_${String(i).padStart(6, '0')}.${ext}`)
    const buf = await encodeImageBuffer(
      src,
      imageFormat,
      imageQuality,
      exportBackground,
      imageFlattenColor
    )
    await fs.writeFile(dest, buf)
    written.push(dest)
    if (masksDir) {
      const maskSrc = frameMaskPngPath(masksDir, i)
      const maskDest = path.join(outputDir, `frame_${String(i).padStart(6, '0')}_mask.png`)
      await fs.copyFile(maskSrc, maskDest)
      written.push(maskDest)
    }
    onProgress?.(Math.round(((i + 1) / frameCount) * 100))
  }

  return written
}

export async function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  const entries = await fs.readdir(sourceDir)
  const zipfile = new yazl.ZipFile()

  await new Promise<void>((resolve, reject) => {
    zipfile.outputStream
      .pipe(createWriteStream(zipPath))
      .on('close', () => resolve())
      .on('error', reject)

    for (const name of entries) {
      zipfile.addFile(path.join(sourceDir, name), name)
    }
    zipfile.end()
  })
}

async function buildPreserveAtlasSheets(options: {
  framesDir: string
  frameCount: number
  outputDir: string
  stem: string
  imageFormat: RecordingImageFormat
  imageQuality: number
  exportBackground: boolean
  imageFlattenColor?: string
  tileW: number
  tileH: number
  maxEdge: number
  onProgress?: (percent: number) => void
}): Promise<string[]> {
  const {
    framesDir,
    frameCount,
    outputDir,
    stem,
    imageFormat,
    imageQuality,
    exportBackground,
    imageFlattenColor,
    tileW,
    tileH,
    maxEdge,
    onProgress,
  } = options

  const { colsMax, rowsMax, tilesPerSheet, sheetCount } = atlasLayout(
    tileW,
    tileH,
    frameCount,
    maxEdge
  )
  const ext = imageFileExtension(imageFormat)
  const paths: string[] = []

  for (let sheet = 0; sheet < sheetCount; sheet++) {
    const start = sheet * tilesPerSheet
    const end = Math.min(frameCount, start + tilesPerSheet)
    const count = end - start
    const cols = Math.min(colsMax, Math.max(1, Math.ceil(Math.sqrt(count))))
    const rows = Math.min(rowsMax, Math.ceil(count / cols))
    const canvasW = cols * tileW
    const canvasH = rows * tileH

    const composites: sharp.OverlayOptions[] = []
    for (let i = 0; i < count; i++) {
      const frameIndex = start + i
      const col = i % cols
      const row = Math.floor(i / cols)
      composites.push({
        input: framePngPath(framesDir, frameIndex),
        left: col * tileW,
        top: row * tileH,
      })
    }

    let pipeline = sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite(composites)

    pipeline = applyAtlasEncode(
      pipeline,
      imageFormat,
      imageQuality,
      exportBackground,
      imageFlattenColor
    )

    const sheetIndex = String(sheet + 1).padStart(2, '0')
    const outPath = path.join(outputDir, `${stem}_atlas_${sheetIndex}.${ext}`)
    await pipeline.toFile(outPath)
    paths.push(outPath)
    onProgress?.(Math.round(((sheet + 1) / sheetCount) * 100))
  }

  return paths
}

/**
 * Force a single atlas sheet. Visually equivalent to compositing at full
 * resolution then scaling the whole canvas down to fit maxEdge — implemented
 * by resizing tiles first to avoid huge intermediate bitmaps.
 */
async function buildFitSingleAtlasSheet(options: {
  framesDir: string
  frameCount: number
  outputDir: string
  stem: string
  imageFormat: RecordingImageFormat
  imageQuality: number
  exportBackground: boolean
  imageFlattenColor?: string
  tileW: number
  tileH: number
  maxEdge: number
  onProgress?: (percent: number) => void
}): Promise<string[]> {
  const {
    framesDir,
    frameCount,
    outputDir,
    stem,
    imageFormat,
    imageQuality,
    exportBackground,
    imageFlattenColor,
    tileW,
    tileH,
    maxEdge,
    onProgress,
  } = options

  const { cols, rows } = singleSheetGrid(frameCount)
  const fullW = cols * tileW
  const fullH = rows * tileH
  const scale = Math.min(1, maxEdge / fullW, maxEdge / fullH)
  const outTileW = Math.max(1, Math.floor(tileW * scale))
  const outTileH = Math.max(1, Math.floor(tileH * scale))
  const canvasW = cols * outTileW
  const canvasH = rows * outTileH

  const composites: sharp.OverlayOptions[] = []
  for (let i = 0; i < frameCount; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const resized =
      outTileW === tileW && outTileH === tileH
        ? framePngPath(framesDir, i)
        : await sharp(framePngPath(framesDir, i))
            .resize(outTileW, outTileH, { fit: 'fill' })
            .png()
            .toBuffer()
    composites.push({
      input: resized,
      left: col * outTileW,
      top: row * outTileH,
    })
    onProgress?.(Math.round(((i + 1) / frameCount) * 90))
  }

  let pipeline = sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites)

  pipeline = applyAtlasEncode(
    pipeline,
    imageFormat,
    imageQuality,
    exportBackground,
    imageFlattenColor
  )

  const ext = imageFileExtension(imageFormat)
  const outPath = path.join(outputDir, `${stem}_atlas_01.${ext}`)
  await pipeline.toFile(outPath)
  onProgress?.(100)
  return [outPath]
}

export async function buildAtlasSheets(options: {
  framesDir: string
  frameCount: number
  outputDir: string
  stem: string
  imageFormat: RecordingImageFormat
  imageQuality: number
  exportBackground: boolean
  imageFlattenColor?: string
  packMode?: AtlasPackMode
  maxEdge?: number
  onProgress?: (percent: number) => void
}): Promise<string[]> {
  const {
    framesDir,
    frameCount,
    outputDir,
    stem,
    imageFormat,
    imageQuality,
    exportBackground,
    imageFlattenColor,
    packMode = 'preserve',
    maxEdge = ATLAS_MAX_EDGE_DEFAULT,
    onProgress,
  } = options

  if (frameCount <= 0) return []

  const firstMeta = await sharp(framePngPath(framesDir, 0)).metadata()
  const tileW = firstMeta.width ?? 0
  const tileH = firstMeta.height ?? 0
  if (tileW <= 0 || tileH <= 0) {
    throw new Error('Unable to read frame dimensions for atlas.')
  }

  await fs.mkdir(outputDir, { recursive: true })

  if (packMode === 'fitSingle') {
    return buildFitSingleAtlasSheet({
      framesDir,
      frameCount,
      outputDir,
      stem,
      imageFormat,
      imageQuality,
      exportBackground,
      imageFlattenColor,
      tileW,
      tileH,
      maxEdge,
      onProgress,
    })
  }

  return buildPreserveAtlasSheets({
    framesDir,
    frameCount,
    outputDir,
    stem,
    imageFormat,
    imageQuality,
    exportBackground,
    imageFlattenColor,
    tileW,
    tileH,
    maxEdge,
    onProgress,
  })
}

async function buildPreserveMaskAtlasSheets(options: {
  masksDir: string
  frameCount: number
  outputDir: string
  stem: string
  tileW: number
  tileH: number
  maxEdge: number
  onProgress?: (percent: number) => void
}): Promise<string[]> {
  const { masksDir, frameCount, outputDir, stem, tileW, tileH, maxEdge, onProgress } = options

  const { colsMax, rowsMax, tilesPerSheet, sheetCount } = atlasLayout(
    tileW,
    tileH,
    frameCount,
    maxEdge
  )
  const paths: string[] = []

  for (let sheet = 0; sheet < sheetCount; sheet++) {
    const start = sheet * tilesPerSheet
    const end = Math.min(frameCount, start + tilesPerSheet)
    const count = end - start
    const cols = Math.min(colsMax, Math.max(1, Math.ceil(Math.sqrt(count))))
    const rows = Math.min(rowsMax, Math.ceil(count / cols))
    const canvasW = cols * tileW
    const canvasH = rows * tileH

    const composites: sharp.OverlayOptions[] = []
    for (let i = 0; i < count; i++) {
      const frameIndex = start + i
      const col = i % cols
      const row = Math.floor(i / cols)
      composites.push({
        input: frameMaskPngPath(masksDir, frameIndex),
        left: col * tileW,
        top: row * tileH,
      })
    }

    const sheetIndex = String(sheet + 1).padStart(2, '0')
    const outPath = path.join(outputDir, `${stem}_atlas_${sheetIndex}_mask.png`)
    await sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    })
      .composite(composites)
      .png()
      .toFile(outPath)
    paths.push(outPath)
    onProgress?.(Math.round(((sheet + 1) / sheetCount) * 100))
  }

  return paths
}

async function buildFitSingleMaskAtlasSheet(options: {
  masksDir: string
  frameCount: number
  outputDir: string
  stem: string
  tileW: number
  tileH: number
  maxEdge: number
  onProgress?: (percent: number) => void
}): Promise<string[]> {
  const { masksDir, frameCount, outputDir, stem, tileW, tileH, maxEdge, onProgress } = options

  const { cols, rows } = singleSheetGrid(frameCount)
  const fullW = cols * tileW
  const fullH = rows * tileH
  const scale = Math.min(1, maxEdge / fullW, maxEdge / fullH)
  const outTileW = Math.max(1, Math.floor(tileW * scale))
  const outTileH = Math.max(1, Math.floor(tileH * scale))
  const canvasW = cols * outTileW
  const canvasH = rows * outTileH

  const composites: sharp.OverlayOptions[] = []
  for (let i = 0; i < frameCount; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const resized =
      outTileW === tileW && outTileH === tileH
        ? frameMaskPngPath(masksDir, i)
        : await sharp(frameMaskPngPath(masksDir, i))
            .resize(outTileW, outTileH, { fit: 'fill' })
            .png()
            .toBuffer()
    composites.push({
      input: resized,
      left: col * outTileW,
      top: row * outTileH,
    })
    onProgress?.(Math.round(((i + 1) / frameCount) * 90))
  }

  const outPath = path.join(outputDir, `${stem}_atlas_01_mask.png`)
  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outPath)
  onProgress?.(100)
  return [outPath]
}

export async function buildMaskAtlasSheets(options: {
  masksDir: string
  frameCount: number
  outputDir: string
  stem: string
  packMode?: AtlasPackMode
  maxEdge?: number
  onProgress?: (percent: number) => void
}): Promise<string[]> {
  const {
    masksDir,
    frameCount,
    outputDir,
    stem,
    packMode = 'preserve',
    maxEdge = ATLAS_MAX_EDGE_DEFAULT,
    onProgress,
  } = options

  if (frameCount <= 0) return []

  const firstMeta = await sharp(frameMaskPngPath(masksDir, 0)).metadata()
  const tileW = firstMeta.width ?? 0
  const tileH = firstMeta.height ?? 0
  if (tileW <= 0 || tileH <= 0) {
    throw new Error('Unable to read mask frame dimensions for atlas.')
  }

  await fs.mkdir(outputDir, { recursive: true })

  if (packMode === 'fitSingle') {
    return buildFitSingleMaskAtlasSheet({
      masksDir,
      frameCount,
      outputDir,
      stem,
      tileW,
      tileH,
      maxEdge,
      onProgress,
    })
  }

  return buildPreserveMaskAtlasSheets({
    masksDir,
    frameCount,
    outputDir,
    stem,
    tileW,
    tileH,
    maxEdge,
    onProgress,
  })
}

export type FinishImagesResult = {
  paths: string[]
  primaryPath: string
}

export async function finishImagesExport(options: {
  framesDir: string
  masksDir?: string
  frameCount: number
  outputDir: string
  stem: string
  images: RecordingImagesOptions
  onProgress?: (stage: string, percent: number) => void
}): Promise<FinishImagesResult> {
  const { framesDir, masksDir, frameCount, outputDir, stem, images, onProgress } = options
  const paths: string[] = []
  let primaryPath = ''
  const exportMask =
    masksDir != null &&
    needsExportMask({
      imageFormat: images.imageFormat,
      exportBackground: images.exportBackground,
      jpegNoBgMode: images.jpegNoBgMode,
    })

  const workRoot = path.join(outputDir, `.${stem}_work_${Date.now()}`)
  await fs.mkdir(workRoot, { recursive: true })

  const hasSequence = images.exportSequence
  const hasAtlas = images.exportAtlas
  const stageCount = (hasSequence ? 1 : 0) + (hasAtlas ? 1 : 0) + (exportMask && hasAtlas ? 1 : 0)
  let stageIndex = 0

  const stageBase = (index: number) => (stageCount > 0 ? index / stageCount : 0)
  const stageSpan = stageCount > 0 ? 1 / stageCount : 1

  try {
    if (hasSequence) {
      onProgress?.('Writing frames…', Math.round(stageBase(stageIndex) * 100))
      const framesOutDir = path.join(workRoot, 'frames')
      await writeConvertedFrames({
        framesDir,
        masksDir: exportMask ? masksDir : undefined,
        frameCount,
        outputDir: framesOutDir,
        imageFormat: images.imageFormat,
        imageQuality: images.imageQuality,
        exportBackground: images.exportBackground,
        imageFlattenColor: images.imageFlattenColor,
        onProgress: pct =>
          onProgress?.(
            'Writing frames…',
            Math.round((stageBase(stageIndex) + (pct / 100) * stageSpan) * 100)
          ),
      })

      if (images.sequencePackage === 'zip') {
        onProgress?.('Zipping…', Math.round(stageBase(stageIndex + 1) * 100))
        const zipPath = path.join(outputDir, `${stem}_frames.zip`)
        await zipDirectory(framesOutDir, zipPath)
        paths.push(zipPath)
        primaryPath = zipPath
      } else {
        const destDir = path.join(outputDir, `${stem}_frames`)
        await fs.rm(destDir, { recursive: true, force: true }).catch(() => undefined)
        await fs.rename(framesOutDir, destDir)
        paths.push(destDir)
        primaryPath = destDir
      }
      stageIndex += 1
    }

    if (hasAtlas) {
      onProgress?.('Building atlas…', Math.round(stageBase(stageIndex) * 100))
      const atlasPaths = await buildAtlasSheets({
        framesDir,
        frameCount,
        outputDir,
        stem,
        imageFormat: images.imageFormat,
        imageQuality: images.imageQuality,
        exportBackground: images.exportBackground,
        imageFlattenColor: images.imageFlattenColor,
        packMode: images.atlasPackMode ?? 'preserve',
        maxEdge: images.atlasMaxEdge ?? ATLAS_MAX_EDGE_DEFAULT,
        onProgress: pct =>
          onProgress?.(
            'Building atlas…',
            Math.round((stageBase(stageIndex) + (pct / 100) * stageSpan) * 100)
          ),
      })
      paths.push(...atlasPaths)
      if (!primaryPath && atlasPaths[0]) primaryPath = atlasPaths[0]
      stageIndex += 1

      if (exportMask && masksDir) {
        onProgress?.('Building mask atlas…', Math.round(stageBase(stageIndex) * 100))
        const maskAtlasPaths = await buildMaskAtlasSheets({
          masksDir,
          frameCount,
          outputDir,
          stem,
          packMode: images.atlasPackMode ?? 'preserve',
          maxEdge: images.atlasMaxEdge ?? ATLAS_MAX_EDGE_DEFAULT,
          onProgress: pct =>
            onProgress?.(
              'Building mask atlas…',
              Math.round((stageBase(stageIndex) + (pct / 100) * stageSpan) * 100)
            ),
        })
        paths.push(...maskAtlasPaths)
        stageIndex += 1
      }
    }

    onProgress?.('Done', 100)
    if (!primaryPath || paths.length === 0) {
      throw new Error('No image outputs were produced.')
    }
    return { paths, primaryPath }
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}
