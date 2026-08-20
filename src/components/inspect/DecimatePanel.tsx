import LinearProgress from '@mui/material/LinearProgress'
import Switch from '@mui/material/Switch'
import { useT } from '../../i18n'
import { percentFromRatio, type DecimateStats } from '../../lib/decimate'
import { LoadingButton } from '../LoadingButton'
import { InspectPanelShell } from './InspectPanelShell'

type DecimatePanelProps = {
  open: boolean
  stats: DecimateStats
  percent: number
  lockBorder: boolean
  exporting: boolean
  exportDisabled?: boolean
  onPercentChange: (percent: number) => void
  onLockBorderChange: (next: boolean) => void
  onExport: () => void
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspect-kv">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function formatCount(n: number) {
  return n.toLocaleString()
}

export function DecimatePanel({
  open,
  stats,
  percent,
  lockBorder,
  exporting,
  exportDisabled = false,
  onPercentChange,
  onLockBorderChange,
  onExport,
  onClose,
}: DecimatePanelProps) {
  const t = useT()
  const welding = stats.phase === 'welding'
  const busy = welding || stats.phase === 'applying' || exporting
  const canExport =
    stats.phase === 'ready' && stats.eligibleCount > 0 && !exporting && !exportDisabled
  const targetPercent = percent
  const actualPercent = percentFromRatio(stats.actualRatio)
  const lockBorderId = 'decimate-lock-border'

  return (
    <InspectPanelShell panelId="decimate" title={t('decimate.title')} open={open} onClose={onClose}>
      {stats.eligibleCount === 0 && stats.phase === 'ready' ? (
        <div className="inspect-empty">{t('decimate.noneEligible')}</div>
      ) : null}

      <div className="inspect-details is-pad decimate-panel-body">
        <p className="decimate-hint">{t('decimate.hardEdgesHint')}</p>

        <label className="decimate-slider-label" htmlFor="decimate-ratio">
          {t('decimate.ratio')}
        </label>
        <div className="decimate-slider-row">
          <input
            id="decimate-ratio"
            className="decimate-slider"
            type="range"
            min={1}
            max={100}
            step={1}
            disabled={welding || stats.eligibleCount === 0}
            value={percent}
            onChange={event => onPercentChange(Number(event.target.value))}
          />
          <span className="decimate-slider-value">{percent}%</span>
        </div>

        <Row label={t('decimate.target')} value={`${targetPercent}% · ${formatCount(stats.targetTriangles)}`} />
        <Row label={t('decimate.actual')} value={`${actualPercent}% · ${formatCount(stats.actualTriangles)}`} />
        {stats.simplificationError != null && stats.simplificationError > 0 ? (
          <Row
            label={t('decimate.simplificationError')}
            value={stats.simplificationError.toPrecision(4)}
          />
        ) : null}
        <Row
          label={t('decimate.triangles')}
          value={`${formatCount(stats.originalTriangles)} → ${formatCount(stats.actualTriangles)}`}
        />
        <Row
          label={t('decimate.vertices')}
          value={`${formatCount(stats.originalVertices)} → ${formatCount(stats.actualVertices)}`}
        />

        {welding ? (
          <div className="decimate-progress">
            <LinearProgress
              variant={stats.weldTotal > 0 ? 'determinate' : 'indeterminate'}
              value={stats.weldTotal > 0 ? (stats.weldDone / stats.weldTotal) * 100 : 0}
            />
            <div className="decimate-progress-label">
              {t('decimate.welding', { done: stats.weldDone, total: stats.weldTotal })}
            </div>
          </div>
        ) : null}

        {stats.skippedSkinned + stats.skippedMorph + stats.skippedSmall > 0 ? (
          <p className="decimate-hint">
            {t('decimate.skipped', {
              eligible: stats.eligibleCount,
              skinned: stats.skippedSkinned,
              morph: stats.skippedMorph,
              small: stats.skippedSmall,
            })}
          </p>
        ) : null}

        <div className="decimate-setting-row">
          <div className="decimate-setting-text">
            <label className="decimate-setting-title" htmlFor={lockBorderId}>
              {t('decimate.lockBorder')}
            </label>
            <p className="decimate-setting-desc">{t('decimate.lockBorderHint')}</p>
          </div>
          <div className="decimate-setting-control">
            <Switch
              id={lockBorderId}
              checked={lockBorder}
              disabled={welding}
              onChange={event => onLockBorderChange(event.target.checked)}
            />
          </div>
        </div>

        {stats.error ? <p className="decimate-error">{stats.error}</p> : null}

        {exporting ? (
          <div className="decimate-progress">
            <LinearProgress variant="indeterminate" />
            <div className="decimate-progress-label">{t('decimate.exporting')}</div>
          </div>
        ) : null}

        <LoadingButton
          variant="contained"
          size="small"
          disabled={!canExport || busy}
          loading={exporting}
          loadingText={t('decimate.exporting')}
          onClick={onExport}
        >
          {t('decimate.export')}
        </LoadingButton>
      </div>
    </InspectPanelShell>
  )
}
