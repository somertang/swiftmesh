import IconButton from '@mui/material/IconButton'
import { Icon } from '../icons'
import { useT } from '../i18n'
import type { AnimationClip } from 'three'

type AnimationPlaybackBarProps = {
  clips: AnimationClip[]
  clipIndex: number
  playing: boolean
  loop: boolean
  time: number
  onClipChange: (index: number) => void
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onToggleLoop: () => void
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AnimationPlaybackBar({
  clips,
  clipIndex,
  playing,
  loop,
  time,
  onClipChange,
  onTogglePlay,
  onSeek,
  onToggleLoop,
}: AnimationPlaybackBarProps) {
  const t = useT()
  if (clips.length === 0) return null

  const clip = clips[clipIndex] ?? clips[0]!
  const duration = Math.max(clip.duration, 0)
  const playLabel = playing ? t('anim.pause') : t('anim.play')

  return (
    <div className="animation-playback-bar" role="group" aria-label={t('anim.aria')}>
      <IconButton
        size="small"
        title={playLabel}
        aria-label={playLabel}
        onClick={onTogglePlay}
      >
        <Icon icon={playing ? 'material-symbols:pause' : 'material-symbols:play-arrow'} aria-hidden />
      </IconButton>
      <label className="animation-playback-clip">
        <span className="visually-hidden">{t('anim.clip')}</span>
        <select
          value={clipIndex}
          aria-label={t('anim.clip')}
          onChange={event => onClipChange(Number(event.target.value))}
        >
          {clips.map((item, index) => (
            <option key={`${item.uuid}:${index}`} value={index}>
              {item.name?.trim() || t('anim.unnamed', { index: index + 1 })}
            </option>
          ))}
        </select>
      </label>
      <input
        className="animation-playback-scrub"
        type="range"
        min={0}
        max={duration || 0}
        step={0.001}
        value={Math.min(time, duration)}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={time}
        aria-label={t('anim.aria')}
        disabled={duration <= 0}
        onChange={event => onSeek(Number(event.target.value))}
      />
      <span className="animation-playback-time" aria-hidden>
        {formatClock(time)} / {formatClock(duration)}
      </span>
      <IconButton
        size="small"
        className={loop ? 'is-active' : undefined}
        title={t('anim.loop')}
        aria-label={t('anim.loop')}
        aria-pressed={loop}
        onClick={onToggleLoop}
      >
        <Icon icon="material-symbols:repeat" aria-hidden />
      </IconButton>
    </div>
  )
}
