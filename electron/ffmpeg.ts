import { app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { RecordingQuality } from '../src/desktopTypes'

const require = createRequire(import.meta.url)

function ffmpegBinaryName() {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

export function resolveFfmpegPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', ffmpegBinaryName())
  }

  try {
    const fromPackage = require('ffmpeg-static') as string | null
    if (fromPackage) return fromPackage
  } catch {
    // fall through
  }

  throw new Error('ffmpeg binary not found (dev: install ffmpeg-static; packaged: missing extraResources)')
}

function mp4QualityArgs(quality: RecordingQuality): string[] {
  switch (quality) {
    case 'lossless':
      return ['-preset', 'veryslow', '-crf', '0']
    case 'high':
      return ['-preset', 'slow', '-crf', '17']
    case 'standard':
    default:
      return ['-preset', 'medium', '-crf', '23']
  }
}

function webmQualityArgs(quality: RecordingQuality): string[] {
  switch (quality) {
    case 'lossless':
      return ['-lossless', '1']
    case 'high':
      return ['-crf', '18', '-b:v', '0']
    case 'standard':
    default:
      return ['-crf', '30', '-b:v', '0']
  }
}

/**
 * Keep MP4 decoding broadly compatible with Windows Media Foundation.
 * We intentionally force 4:2:0 chroma for all quality tiers.
 */
function mp4PixFmt(): string {
  return 'yuv420p'
}

/**
 * Use broadly compatible VP9 pixel format for WebM as well.
 */
function webmPixFmt(): string {
  return 'yuv420p'
}

function mp4CompatibilityArgs(): string[] {
  // Conservative defaults for Windows built-in decoder compatibility.
  return ['-profile:v', 'high', '-level:v', '5.2']
}

export async function convertWebmToMp4(
  webmPath: string,
  mp4Path: string,
  quality: RecordingQuality
): Promise<void> {
  const ffmpegPath = resolveFfmpegPath()
  await fs.access(ffmpegPath)
  const qualityArgs = mp4QualityArgs(quality)
  const pixFmt = mp4PixFmt()
  const compatibilityArgs = mp4CompatibilityArgs()

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        '-y',
        '-i',
        webmPath,
        '-c:v',
        'libx264',
        ...qualityArgs,
        ...compatibilityArgs,
        '-pix_fmt',
        pixFmt,
        '-movflags',
        '+faststart',
        '-an',
        mp4Path,
      ],
      { windowsHide: true }
    )

    let stderr = ''
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', error => reject(error))
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`))
    })
  })
}

function runFfmpegWithProgress(
  ffmpegPath: string,
  args: string[],
  totalFrames: number,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      const text = String(chunk)
      stderr += text
      if (onProgress && totalFrames > 0) {
        const match = /frame=\s*(\d+)/.exec(text)
        if (match) {
          const done = parseInt(match[1], 10)
          onProgress(Math.min(100, Math.round((done / totalFrames) * 100)))
        }
      }
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        onProgress?.(100)
        resolve()
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`))
      }
    })
  })
}

export async function encodePngFramesToMp4({
  framesDir,
  fps,
  frameCount,
  quality,
  outputPath,
  onProgress,
}: {
  framesDir: string
  fps: number
  frameCount: number
  quality: RecordingQuality
  outputPath: string
  onProgress?: (percent: number) => void
}): Promise<void> {
  const ffmpegPath = resolveFfmpegPath()
  await fs.access(ffmpegPath)

  const qualityArgs = mp4QualityArgs(quality)
  const pixFmt = mp4PixFmt()
  const compatibilityArgs = mp4CompatibilityArgs()
  const inputPattern = path.join(framesDir, 'frame_%06d.png')

  await runFfmpegWithProgress(
    ffmpegPath,
    [
      '-y',
      '-framerate',
      String(fps),
      '-start_number',
      '0',
      '-i',
      inputPattern,
      '-frames:v',
      String(frameCount),
      '-c:v',
      'libx264',
      ...qualityArgs,
      ...compatibilityArgs,
      '-pix_fmt',
      pixFmt,
      '-movflags',
      '+faststart',
      '-an',
      outputPath,
    ],
    frameCount,
    onProgress
  )
}

export async function encodePngFramesToWebm({
  framesDir,
  fps,
  frameCount,
  quality,
  outputPath,
  onProgress,
}: {
  framesDir: string
  fps: number
  frameCount: number
  quality: RecordingQuality
  outputPath: string
  onProgress?: (percent: number) => void
}): Promise<void> {
  const ffmpegPath = resolveFfmpegPath()
  await fs.access(ffmpegPath)

  const qualityArgs = webmQualityArgs(quality)
  const pixFmt = webmPixFmt()
  const inputPattern = path.join(framesDir, 'frame_%06d.png')

  await runFfmpegWithProgress(
    ffmpegPath,
    [
      '-y',
      '-framerate',
      String(fps),
      '-start_number',
      '0',
      '-i',
      inputPattern,
      '-frames:v',
      String(frameCount),
      '-c:v',
      'libvpx-vp9',
      ...qualityArgs,
      '-pix_fmt',
      pixFmt,
      '-an',
      outputPath,
    ],
    frameCount,
    onProgress
  )
}

/** @deprecated Use encodePngFramesToMp4 */
export const encodeJpegFramesToMp4 = encodePngFramesToMp4
/** @deprecated Use encodePngFramesToWebm */
export const encodeJpegFramesToWebm = encodePngFramesToWebm

export async function verifyEncodedVideo(
  filePath: string,
  minBytes = 16 * 1024
): Promise<void> {
  const stat = await fs.stat(filePath)
  if (stat.size < minBytes) {
    throw new Error(`Encoded video looks too small (${stat.size} bytes): ${path.basename(filePath)}`)
  }

  const ffmpegPath = resolveFfmpegPath()
  await fs.access(ffmpegPath)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ['-v', 'error', '-i', filePath, '-f', 'null', '-'],
      { windowsHide: true }
    )
    let stderr = ''
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`Encoded video verification failed (${path.basename(filePath)}): ${stderr.slice(-800)}`))
    })
  })
}
