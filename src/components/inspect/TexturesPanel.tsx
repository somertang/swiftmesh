import { useMemo, useState } from 'react'
import { Icon } from '../../icons'
import { useT } from '../../i18n'
import { downloadTexturePng, type TextureInspectItem } from '../../lib/inspectScene'
import { InspectPanelShell } from './InspectPanelShell'

type TexturesPanelProps = {
  open: boolean
  items: TextureInspectItem[]
  onClose: () => void
}

export function TexturesPanel({ open, items, onClose }: TexturesPanelProps) {
  const t = useT()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      item =>
        item.name.toLowerCase().includes(q) ||
        item.slots.some(slot => slot.toLowerCase().includes(q)) ||
        item.materialNames.some(name => name.toLowerCase().includes(q))
    )
  }, [items, query])

  return (
    <InspectPanelShell
      panelId="textures"
      title={t('textures.titleCount', { count: items.length })}
      open={open}
      onClose={onClose}
    >
      <div className="inspect-search">
        <Icon icon="material-symbols:search" className="inspect-search-icon" aria-hidden />
        <input
          type="search"
          className="input input-sm input-bordered w-full"
          placeholder={t('textures.searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label={t('textures.search')}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="inspect-empty">
          {items.length === 0 ? t('textures.empty') : t('hierarchy.noMatches')}
        </div>
      ) : (
        <ul className="inspect-list">
          {filtered.map(item => (
            <li key={item.id} className="inspect-card card card-compact">
              <div className="inspect-thumb-wrap">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt="" className="inspect-thumb" />
                ) : (
                  <div className="inspect-thumb is-empty">{t('textures.noPreview')}</div>
                )}
              </div>
              <div className="inspect-card-main">
                <div className="inspect-card-title">{item.name}</div>
                <div className="inspect-card-meta">
                  {item.width && item.height ? `${item.width}×${item.height}` : 'Unknown size'}
                  {item.slots.length > 0 ? ` · ${item.slots.join(', ')}` : ''}
                </div>
                {item.materialNames.length > 0 ? (
                  <div className="inspect-card-sub">{item.materialNames.join(', ')}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="inspect-icon-btn btn btn-xs btn-square"
                title={t('textures.download', { name: item.name })}
                aria-label={t('textures.download', { name: item.name })}
                disabled={!item.previewUrl}
                onClick={() => downloadTexturePng(item.texture, item.name)}
              >
                <Icon icon="material-symbols:download" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </InspectPanelShell>
  )
}
