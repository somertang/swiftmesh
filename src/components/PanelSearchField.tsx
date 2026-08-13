import TextField from '@mui/material/TextField'
import type { ChangeEvent } from 'react'
import { Icon } from '../icons'

type PanelSearchFieldProps = {
  /** Outer shell class — `hier-search` or `inspect-search`. */
  className?: string
  value: string
  placeholder: string
  'aria-label': string
  onChange: (value: string) => void
}

/** Compact filter-style search for viewport floating panels (shell + borderless input). */
export function PanelSearchField({
  className = 'inspect-search',
  value,
  placeholder,
  'aria-label': ariaLabel,
  onChange,
}: PanelSearchFieldProps) {
  return (
    <div className={className}>
      <Icon icon="material-symbols:search" className="panel-search-icon" aria-hidden />
      <TextField
        type="search"
        variant="standard"
        size="small"
        fullWidth
        placeholder={placeholder}
        value={value}
        aria-label={ariaLabel}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        slotProps={{
          input: { disableUnderline: true },
        }}
      />
    </div>
  )
}
