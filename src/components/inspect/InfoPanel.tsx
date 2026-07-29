import { useT } from '../../i18n'
import type { SceneInfoStats } from '../../lib/inspectScene'
import { InspectPanelShell } from './InspectPanelShell'

type InfoPanelProps = {
  open: boolean
  stats: SceneInfoStats | null
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inspect-kv">
      <span>{label}</span>
      <span>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  )
}

export function InfoPanel({ open, stats, onClose }: InfoPanelProps) {
  const t = useT()
  return (
    <InspectPanelShell panelId="info" title={t('info.title')} open={open} onClose={onClose}>
      {!stats ? (
        <div className="inspect-empty">{t('info.empty')}</div>
      ) : (
        <div className="inspect-details is-pad">
          <Row label={t('info.model')} value={stats.modelLabel} />
          <Row label={t('info.meshes')} value={stats.meshCount} />
          <Row label={t('info.skinnedMeshes')} value={stats.skinnedMeshCount} />
          <Row label={t('info.geometries')} value={stats.geometryCount} />
          <Row label={t('info.materials')} value={stats.materialCount} />
          <Row label={t('info.textures')} value={stats.textureCount} />
          <Row label={t('info.vertices')} value={stats.vertexCount} />
          <Row label={t('info.triangles')} value={stats.triangleCount} />
          <Row label={t('info.drawCalls')} value={stats.drawCallEstimate} />
          <Row label={t('info.animations')} value={stats.animationCount} />
        </div>
      )}
    </InspectPanelShell>
  )
}
