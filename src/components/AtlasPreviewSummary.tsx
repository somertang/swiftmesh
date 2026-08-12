import Typography from '@mui/material/Typography'
import { previewAtlasPack } from '../lib/atlasLayout'
import type { AtlasPackMode } from '../desktopTypes'
import { useT } from '../i18n'

type AtlasPreviewSummaryProps = {
  tileW: number
  tileH: number
  frameCount: number
  packMode: AtlasPackMode
  maxEdge: number
  /** When multi-axis, show per-pitch note. */
  pitchCount?: number
  className?: string
}

/** Live atlas packing preview for record popover / preferences. */
export function AtlasPreviewSummary({
  tileW,
  tileH,
  frameCount,
  packMode,
  maxEdge,
  pitchCount,
  className,
}: AtlasPreviewSummaryProps) {
  const t = useT()
  const preview = previewAtlasPack({
    tileW,
    tileH,
    frameCount,
    packMode,
    maxEdge,
  })

  return (
    <div className={className ?? 'record-atlas-preview'}>
      <Typography variant="caption" color="text.secondary" component="div">
        {t('record.atlasPreview.label')}
      </Typography>
      <Typography variant="body2" component="div" sx={{ mt: 0.25 }}>
        {preview.summary}
      </Typography>
      {pitchCount != null && pitchCount > 1 ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          {t('record.atlasPreview.perPitch', { count: String(pitchCount) })}
        </Typography>
      ) : null}
      {preview.warning ? (
        <Typography variant="caption" color="warning.main" component="div" sx={{ mt: 0.5 }}>
          {preview.warning}
        </Typography>
      ) : null}
    </div>
  )
}
