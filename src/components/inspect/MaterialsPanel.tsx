import Button from '@mui/material/Button'
import { useMemo, useState } from 'react'
import { Icon } from '../../icons'
import { useT } from '../../i18n'
import type { MaterialInspectItem } from '../../lib/inspectScene'
import { PanelSearchField } from '../PanelSearchField'
import { InspectPanelShell } from './InspectPanelShell'

type MaterialsPanelProps = {
  open: boolean
  items: MaterialInspectItem[]
  onClose: () => void
  onSelectMesh: (id: string) => void
}

export function MaterialsPanel({ open, items, onClose, onSelectMesh }: MaterialsPanelProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      item =>
        item.name.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.meshNames.some(name => name.toLowerCase().includes(q))
    )
  }, [items, query])

  return (
    <InspectPanelShell
      panelId="materials"
      title={t('materials.titleCount', { count: items.length })}
      open={open}
      onClose={onClose}
    >
      <PanelSearchField
        placeholder={t('materials.searchPlaceholder')}
        value={query}
        aria-label={t('materials.search')}
        onChange={setQuery}
      />

      {filtered.length === 0 ? (
        <div className="inspect-empty">
          {items.length === 0 ? t('materials.empty') : t('hierarchy.noMatches')}
        </div>
      ) : (
        <ul className="inspect-list">
          {filtered.map(item => {
            const expanded = expandedId === item.id
            return (
              <li key={item.id} className="inspect-card is-stack">
                <button
                  type="button"
                  className="inspect-card-toggle"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  <span
                    className="inspect-swatch"
                    style={item.color ? { background: item.color } : undefined}
                    aria-hidden
                  />
                  <span className="inspect-card-main">
                    <span className="inspect-card-title">{item.name}</span>
                    <span className="inspect-card-meta">
                      {item.type}
                      {item.meshNames.length > 0 ? ` · ${item.meshNames.length} mesh(es)` : ''}
                    </span>
                  </span>
                  <Icon
                    icon={
                      expanded ? 'material-symbols:expand-more' : 'material-symbols:chevron-right'
                    }
                    aria-hidden
                  />
                </button>

                {expanded ? (
                  <div className="inspect-details">
                    <div className="inspect-kv">
                      <span>{t('materials.opacity')}</span>
                      <span>{item.opacity.toFixed(2)}</span>
                    </div>
                    <div className="inspect-kv">
                      <span>{t('materials.transparent')}</span>
                      <span>{item.transparent ? t('common.yes') : t('common.no')}</span>
                    </div>
                    {item.color ? (
                      <div className="inspect-kv">
                        <span>{t('materials.color')}</span>
                        <span>{item.color}</span>
                      </div>
                    ) : null}
                    <div className="inspect-kv">
                      <span>{t('materials.maps')}</span>
                      <span>{item.mapSlots.length ? item.mapSlots.join(', ') : 'none'}</span>
                    </div>
                    {item.meshIds.length > 0 ? (
                      <div className="inspect-mesh-links">
                        {item.meshIds.map((meshId, index) => (
                          <Button
                            key={meshId}
                            className="inspect-link-btn"
                            size="small"
                            onClick={() => onSelectMesh(meshId)}
                          >
                            {item.meshNames[index] ?? meshId}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </InspectPanelShell>
  )
}
