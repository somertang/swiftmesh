import { useMemo, useState, type MouseEvent } from 'react'
import { Icon } from '../../icons'
import { useT } from '../../i18n'
import type { GeometryInspectItem } from '../../lib/inspectScene'
import { InspectPanelShell } from './InspectPanelShell'

type GeometriesPanelProps = {
  open: boolean
  items: GeometryInspectItem[]
  onClose: () => void
  onSelectMesh: (id: string) => void
}

function formatCount(n: number) {
  return n.toLocaleString()
}

function formatAttributes(attrs: string[]) {
  if (attrs.length === 0) return '—'
  return `[${attrs.join(', ')}]`
}

export function GeometriesPanel({ open, items, onClose, onSelectMesh }: GeometriesPanelProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      item =>
        item.name.toLowerCase().includes(q) ||
        item.meshNames.some(name => name.toLowerCase().includes(q)) ||
        item.attributes.some(attr => attr.toLowerCase().includes(q))
    )
  }, [items, query])

  return (
    <InspectPanelShell
      panelId="geometries"
      title={t('geometries.titleCount', { count: items.length })}
      open={open}
      onClose={onClose}
    >
      <div className="inspect-search">
        <Icon icon="material-symbols:search" className="inspect-search-icon" aria-hidden />
        <input
          type="search"
          className="input input-sm input-bordered w-full"
          placeholder={t('geometries.searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label={t('geometries.search')}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="inspect-empty">
          {items.length === 0 ? t('geometries.empty') : t('hierarchy.noMatches')}
        </div>
      ) : (
        <div className="inspect-table-wrap">
          <table className="inspect-table table table-zebra table-xs">
            <thead>
              <tr>
                <th scope="col">{t('common.name')}</th>
                <th scope="col">{t('geometries.vertices')}</th>
                <th scope="col">{t('geometries.attributes')}</th>
                <th scope="col">{t('geometries.meshes')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const expanded = expandedId === item.id
                const meshLabel =
                  item.meshNames.length === 0
                    ? '—'
                    : item.meshNames.length === 1
                      ? item.meshNames[0]
                      : `[${item.meshNames.length} meshes]`

                const toggle = () => setExpandedId(expanded ? null : item.id)

                const selectFirstMesh = (event: MouseEvent) => {
                  event.stopPropagation()
                  const id = item.meshIds[0]
                  if (id) onSelectMesh(id)
                }

                return (
                  <>
                    <tr
                      key={item.id}
                      className={`inspect-table-row${expanded ? ' is-expanded' : ''}`}
                      onClick={toggle}
                    >
                      <td className="inspect-table-name">
                        <Icon
                          icon={
                            expanded
                              ? 'material-symbols:expand-more'
                              : 'material-symbols:chevron-right'
                          }
                          className="inspect-table-caret"
                          aria-hidden
                        />
                        <span title={item.name}>{item.name}</span>
                      </td>
                      <td className="inspect-table-num">{formatCount(item.vertexCount)}</td>
                      <td className="inspect-table-attrs" title={item.attributes.join(', ')}>
                        {formatAttributes(item.attributes)}
                      </td>
                      <td className="inspect-table-meshes">
                        {item.meshIds.length > 0 ? (
                          <button
                            type="button"
                            className="inspect-table-mesh-btn btn btn-xs"
                            title={item.meshNames.join(', ')}
                            onClick={selectFirstMesh}
                          >
                            {meshLabel}
                          </button>
                        ) : (
                          <span className="inspect-table-muted">{meshLabel}</span>
                        )}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr key={`${item.id}-detail`} className="inspect-table-detail">
                        <td colSpan={4}>
                          <div className="inspect-details is-pad">
                            <div className="inspect-kv">
                              <span>{t('geometries.triangles')}</span>
                              <span>{formatCount(item.triangleCount)}</span>
                            </div>
                            <div className="inspect-kv">
                              <span>{t('geometries.attributes')}</span>
                              <span>{item.attributes.join(', ') || 'none'}</span>
                            </div>
                            {item.meshIds.length > 0 ? (
                              <div className="inspect-mesh-links">
                                {item.meshIds.map((meshId, index) => (
                                  <button
                                    key={meshId}
                                    type="button"
                                    className="inspect-link-btn btn btn-xs"
                                    onClick={() => onSelectMesh(meshId)}
                                  >
                                    {item.meshNames[index] ?? meshId}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </InspectPanelShell>
  )
}
