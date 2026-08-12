import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { normalizeFlattenColor, parseFlattenColor } from '../lib/recordingPresets'

export function FlattenColorField({
  id,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  id: string
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  const normalized = normalizeFlattenColor(value)
  const [hexDraft, setHexDraft] = useState(normalized)

  useEffect(() => {
    setHexDraft(normalized)
  }, [normalized])

  const commitDraft = () => {
    const next = parseFlattenColor(hexDraft)
    if (next) {
      onChange(next)
      setHexDraft(next)
      return
    }
    setHexDraft(normalized)
  }

  return (
    <div className="flatten-color-field">
      <input
        type="color"
        id={id}
        value={normalized}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={e => onChange(normalizeFlattenColor(e.target.value))}
      />
      <TextField
        size="small"
        value={hexDraft}
        disabled={disabled}
        onChange={e => setHexDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        slotProps={{
          htmlInput: {
            spellCheck: false,
            'aria-label': ariaLabel ? `${ariaLabel} hex` : 'Flatten color hex',
          },
        }}
      />
    </div>
  )
}
