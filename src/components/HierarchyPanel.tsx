import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Icon } from '../icons'
import { useT } from '../i18n'
import { StripeCircularLoader } from './StripeCircularLoader'
import {
  collectAllExpandIds,
  filterHierarchy,
  findHierarchyPath,
  type HierarchyNode,
} from '../lib/sceneHierarchy'
import { usePanelWidth } from '../lib/usePanelWidth'

type HierarchyPanelProps = {
  open: boolean
  /** Changes when a new model is loaded — used to reset expand/search without reacting to visibility sync. */
  modelKey: string
  root: HierarchyNode | null
  selectedId: string | null
  onOpenChange: (open: boolean) => void
  onSelect: (id: string | null) => void
  onToggleVisible: (id: string) => void
}

function KindIcon({ kind }: { kind: HierarchyNode['kind'] }) {
  if (kind === 'mesh') {
    return (
      <span title="Mesh">
        <Icon icon="material-symbols:deployed-code" className="hier-icon hier-icon-mesh" aria-hidden />
      </span>
    )
  }
  if (kind === 'group') {
    return (
      <span title="Group">
        <Icon icon="material-symbols:folder" className="hier-icon hier-icon-group" aria-hidden />
      </span>
    )
  }
  return (
    <span title="Object">
      <Icon icon="material-symbols:adjust" className="hier-icon" aria-hidden />
    </span>
  )
}

function TreeRow({
  node,
  depth,
  selectedId,
  expanded,
  onToggleExpand,
  onSelect,
  onToggleVisible,
}: {
  node: HierarchyNode
  depth: number
  selectedId: string | null
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onSelect: (id: string | null) => void
  onToggleVisible: (id: string) => void
}) {
  const t = useT()
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)
  const selected = selectedId === node.id

  const handleExpand = (event: MouseEvent) => {
    event.stopPropagation()
    if (hasChildren) onToggleExpand(node.id)
  }

  const handleEye = (event: MouseEvent) => {
    event.stopPropagation()
    if (node.id === 'scene-root') return
    onToggleVisible(node.id)
  }

  return (
    <>
      <div
        className={`hier-row${selected ? ' is-selected' : ''}${node.visible ? '' : ' is-hidden'}`}
        style={{ paddingLeft: `${0.35 + depth * 0.7}rem` }}
        data-hier-id={node.id}
        onClick={() => {
          if (node.id === 'scene-root') {
            onSelect(null)
            return
          }
          onSelect(node.id)
        }}
      >
        <button
          type="button"
          className={`hier-expand btn btn-ghost btn-xs btn-square${hasChildren ? '' : ' is-empty'}`}
          onClick={handleExpand}
          aria-label={
            hasChildren ? (isOpen ? t('common.collapse') : t('common.expand')) : undefined
          }
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            <Icon
              icon={isOpen ? 'material-symbols:expand-more' : 'material-symbols:chevron-right'}
              aria-hidden
            />
          ) : null}
        </button>

        <KindIcon kind={node.kind} />

        <span className="hier-name">
          {node.name}
          {node.childCount > 0 ? <span className="hier-count"> ({node.childCount})</span> : null}
        </span>

        {node.id !== 'scene-root' ? (
          <button
            type="button"
            className={`hier-eye btn btn-ghost btn-xs btn-square${node.visible ? '' : ' is-off'}`}
            onClick={handleEye}
            title={node.visible ? t('common.hide') : t('common.show')}
            aria-label={node.visible ? t('common.hide') : t('common.show')}
          >
            <Icon
              icon={node.visible ? 'material-symbols:visibility' : 'material-symbols:visibility-off'}
              aria-hidden
            />
          </button>
        ) : (
          <span className="hier-eye-spacer" />
        )}
      </div>

      {hasChildren && isOpen
        ? node.children.map(child => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onToggleVisible={onToggleVisible}
            />
          ))
        : null}
    </>
  )
}

export function HierarchyPanel({
  open,
  modelKey,
  root,
  selectedId,
  onOpenChange,
  onSelect,
  onToggleVisible,
}: HierarchyPanelProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['scene-root']))
  const rootRef = useRef(root)
  rootRef.current = root
  const rootReady = Boolean(root)

  // Clear search on model change. Expand-all when the tree is ready for that model —
  // keyed by rootReady so visibility sync (new root object, same readiness) does not reset.
  useEffect(() => {
    setQuery('')
  }, [modelKey])

  useEffect(() => {
    if (!root) return
    setExpanded(collectAllExpandIds(root))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit `root`
  }, [modelKey, rootReady])

  // Opening the panel also expands everything (e.g. after switching away and back).
  useEffect(() => {
    if (!open) return
    const current = rootRef.current
    if (current) setExpanded(collectAllExpandIds(current))
  }, [open])

  useEffect(() => {
    if (!root || !selectedId) return
    const path = findHierarchyPath(root, selectedId)
    if (!path) return
    setExpanded(prev => {
      const next = new Set(prev)
      for (const id of path) next.add(id)
      return next
    })
  }, [root, selectedId])

  useEffect(() => {
    if (!open || !selectedId) return
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return
        const row = document.querySelector(`.hier-tree [data-hier-id="${CSS.escape(selectedId)}"]`)
        row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [open, selectedId, expanded])

  const filtered = useMemo(() => {
    if (!root) return null
    return filterHierarchy(root, query)
  }, [root, query])

  useEffect(() => {
    if (!filtered || !query.trim()) return
    setExpanded(collectAllExpandIds(filtered))
  }, [filtered, query])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { width, onResizePointerDown } = usePanelWidth('hierarchy')

  // Stay mounted while open even if root is briefly null, so expand/search survive reloads.
  if (!open) return null

  return (
    <div className="hier-panel card bg-base-200/95" style={{ width }}>
      <div className="hier-header">
        <span className="hier-header-title">{t('tool.hierarchy')}</span>
        <button
          type="button"
          className="hier-close btn btn-ghost btn-xs btn-square"
          onClick={() => onOpenChange(false)}
          aria-label={t('common.close')}
        >
          <Icon icon="material-symbols:close" aria-hidden />
        </button>
      </div>

      <div className="hier-search">
        <Icon icon="material-symbols:search" className="hier-search-icon" aria-hidden />
        <input
          type="search"
          className="input input-sm input-bordered w-full"
          placeholder={t('hierarchy.searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label={t('hierarchy.search')}
        />
      </div>

      <div className="hier-tree">
        {filtered ? (
          <TreeRow
            node={filtered}
            depth={0}
            selectedId={selectedId}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onSelect={onSelect}
            onToggleVisible={onToggleVisible}
          />
        ) : (
          <div className={`hier-empty${root ? '' : ' hier-empty--loading'}`}>
            {root ? (
              t('hierarchy.noMatches')
            ) : (
              <>
                <StripeCircularLoader aria-hidden />
                <span>{t('common.loading')}</span>
              </>
            )}
          </div>
        )}
      </div>
      <div
        className="inspect-resize-handle"
        onPointerDown={onResizePointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('common.resizePanel')}
      />
    </div>
  )
}
