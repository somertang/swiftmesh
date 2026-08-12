import TextField from '@mui/material/TextField'

type FrameCountControlProps = {
  id: string
  value: number
  onChange: (frameCount: number) => void
  /** Accessible name for the number field (label is usually outside). */
  ariaLabel: string
}

function clampFrameCount(raw: number): number {
  return Math.max(1, Math.min(720, Math.round(raw) || 1))
}

/** Number input for frames per revolution (1–720). */
export function FrameCountControl({ id, value, onChange, ariaLabel }: FrameCountControlProps) {
  return (
    <TextField
      id={id}
      type="number"
      size="small"
      slotProps={{ htmlInput: { min: 1, max: 720, step: 1 } }}
      value={value}
      onChange={e => onChange(clampFrameCount(Number(e.target.value)))}
      aria-label={ariaLabel}
    />
  )
}
