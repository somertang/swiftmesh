import { toEvenDimension } from './recordingPresets'
import type { CaptureHandle } from '../components/ViewerScene'

export type RecordingOutputSize = {
  width: number
  height: number
}

export type CaptureFrameSequenceOptions = {
  captureHandle: CaptureHandle
  totalFrames: number
  outputSize: RecordingOutputSize
  onFrame: (frameIndex: number, pngData: ArrayBuffer, maskData?: ArrayBuffer) => Promise<void>
  onProgress?: (capturedFrames: number, totalFrames: number) => void
  /** Signal to abort early. */
  signal?: { aborted: boolean }
  /**
   * Internal render supersampling factor (e.g. 2 = render at 2x then
   * downscale with high-quality filtering). Defaults to 1 (no supersampling).
   */
  renderScale?: number
  /** Capture companion grayscale mask PNGs after each color frame. */
  exportMask?: boolean
}

/**
 * Fixed-step offline capture: advances model rotation by 2π/totalFrames per frame,
 * captures a PNG, calls onFrame, and reports progress.
 * Returns the number of frames captured.
 */
export async function captureFrameSequence({
  captureHandle,
  totalFrames,
  outputSize,
  onFrame,
  onProgress,
  signal,
  renderScale = 1,
  exportMask = false,
}: CaptureFrameSequenceOptions): Promise<number> {
  const tw = toEvenDimension(outputSize.width)
  const th = toEvenDimension(outputSize.height)

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) break

    const rotationY = (Math.PI * 2 * i) / totalFrames
    const pngData = await captureHandle.captureFrame(rotationY, { width: tw, height: th }, renderScale)
    if (i === 0 && !isLikelyPng(pngData)) {
      throw new Error('Captured frame is invalid (PNG signature check failed).')
    }
    let maskData: ArrayBuffer | undefined
    if (exportMask) {
      if (!captureHandle.captureMaskFrame) {
        throw new Error('Mask export requested but capture handle has no mask pass.')
      }
      maskData = await captureHandle.captureMaskFrame(rotationY, { width: tw, height: th }, renderScale)
      if (!isLikelyPng(maskData)) {
        throw new Error('Captured mask frame is invalid (PNG signature check failed).')
      }
    }
    await onFrame(i, pngData, maskData)
    onProgress?.(i + 1, totalFrames)
  }

  return signal?.aborted ? 0 : totalFrames
}

function isLikelyPng(data: ArrayBuffer): boolean {
  if (data.byteLength < 16) return false
  const bytes = new Uint8Array(data, 0, 8)
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}
