import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type Object3D,
} from 'three'

export type AnimationPlaybackSnapshot = {
  playing: boolean
  clipIndex: number
  time: number
  duration: number
  loop: boolean
}

export type CaptureFrameOptions = {
  /** Offline capture frame index. Omit for preflight so the mixer is not seeked. */
  frameIndex?: number
  fps?: number
}

export type AnimationCaptureApi = {
  snapshot: () => AnimationPlaybackSnapshot | null
  seekCapture: (snapshot: AnimationPlaybackSnapshot, frameIndex: number, fps: number) => void
  restore: (snapshot: AnimationPlaybackSnapshot) => void
  setLiveEnabled: (enabled: boolean) => void
}

export function clipDisplayName(clip: AnimationClip, index: number): string {
  const name = clip.name?.trim()
  return name || `Clip ${index + 1}`
}

export function captureSeekTime(
  snapshot: AnimationPlaybackSnapshot,
  frameIndex: number,
  fps: number
): number {
  const duration = Math.max(snapshot.duration, 1e-6)
  const t = snapshot.time + frameIndex / Math.max(fps, 1e-6)
  if (snapshot.loop) {
    const wrapped = t % duration
    return wrapped < 0 ? wrapped + duration : wrapped
  }
  return Math.min(Math.max(t, 0), duration)
}

export function applyClipLoop(action: AnimationAction, loop: boolean) {
  if (loop) {
    action.setLoop(LoopRepeat, Infinity)
    action.clampWhenFinished = false
  } else {
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
  }
}

export function createAnimationMixer(root: Object3D): AnimationMixer {
  return new AnimationMixer(root)
}

export function bindClipAction(
  mixer: AnimationMixer,
  clip: AnimationClip,
  loop: boolean
): AnimationAction {
  mixer.stopAllAction()
  const action = mixer.clipAction(clip)
  applyClipLoop(action, loop)
  action.enabled = true
  action.paused = true
  action.time = 0
  action.play()
  mixer.update(0)
  return action
}

export function seekAction(mixer: AnimationMixer, action: AnimationAction, time: number) {
  action.enabled = true
  action.paused = true
  action.time = time
  mixer.update(0)
}
