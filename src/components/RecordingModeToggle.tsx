import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import type { RecordingMode } from '../desktopTypes'
import { RECORDING_MODE_OPTIONS } from '../lib/recordingPresets'
import { useT, type MessageKey } from '../i18n'

type RecordingModeToggleProps = {
  value: RecordingMode
  onChange: (mode: RecordingMode) => void
  id?: string
}

export function RecordingModeToggle({ value, onChange, id }: RecordingModeToggleProps) {
  const t = useT()
  return (
    <ButtonGroup
      id={id}
      className="recording-mode-toggle"
      size="small"
      variant="outlined"
      aria-label={t('record.mode')}
    >
      {RECORDING_MODE_OPTIONS.map(opt => (
        <Button
          key={opt.value}
          type="button"
          variant={value === opt.value ? 'contained' : 'outlined'}
          color={value === opt.value ? 'primary' : 'inherit'}
          onClick={() => onChange(opt.value)}
        >
          {t(`record.mode.${opt.value}` as MessageKey)}
        </Button>
      ))}
    </ButtonGroup>
  )
}
