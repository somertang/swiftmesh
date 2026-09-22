import IconButton from '@mui/material/IconButton'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type UIEvent,
} from 'react'
import { Icon } from '../icons'
import { useT } from '../i18n'
import { StripeCircularLoader } from './StripeCircularLoader'
import { PanelSearchField } from './PanelSearchField'
import {
  collectAllExpandIds,
  filterHierarchy,
  flattenHierarchy,
  hierarchyClipboardTree,
  type FlatHierarchyRow,
  type HierarchyNode,
} from '../lib/sceneHierarchy'
import { usePanelWidth } from '../lib/usePanelWidth'

/** Keep in sync with `.hier-row` min-height for windowed scrolling. */
const ROW_HEIGHT_PX = 28
const OVERSCAN = 10
const COPY_FEEDBACK_MS = 1200

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

type HierarchyPanelProps = {
  open: boolean
  /** Changes when a new model is loaded — used to reset expand/search without reacting to visibility sync. */
  modelKey: string
  root: HierarchyNode | null
  /** id → ancestor chain (scene-root → … → id). Built with the hierarchy. */
  paths: Map<string, string[]> | null
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

const TreeRow = memo(function TreeRow({
  node,
  depth,
  selected,
  expanded,
  onToggleExpand,
  onSelect,
  onToggleVisible,
}: {
  node: HierarchyNode
  depth: number
  selected: boolean
  expanded: boolean
  onToggleExpand: (id: string) => void
  onSelect: (id: string | null) => void
  onToggleVisible: (id: string) => void
}) {
  const t = useT()
  const hasChildren = node.children.length > 0
  const [nameCopied, setNameCopied] = useState(false)
  const copyTimer = useRef(0)

  useEffect(() => {
    return () => window.clearTimeout(copyTimer.current)
  }, [])

  const handleExpand = (event: MouseEvent) => {
    event.stopPropagation()
    if (hasChildren) onToggleExpand(node.id)
  }

  const handleEye = (event: MouseEvent) => {
    event.stopPropagation()
    if (node.id === 'scene-root') return
    onToggleVisible(node.id)
  }

  const handleCopyName = (event: MouseEvent) => {
    event.stopPropagation()
    void writeClipboard(node.name)
      .then(() => {
        setNameCopied(true)
        window.clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => setNameCopied(false), COPY_FEEDBACK_MS)
      })
      .catch(() => {})
  }

  return (
    <div
      className={`hier-row${selected ? ' is-selected' : ''}${node.visible ? '' : ' is-hidden'}`}
      style={{ paddingLeft: `${0.35 + depth * 0.7}rem`, height: ROW_HEIGHT_PX }}
      data-hier-id={node.id}
      onClick={() => {
        if (node.id === 'scene-root') {
          onSelect(null)
          return
        }
        onSelect(node.id)
      }}
    >
      <IconButton
        className={`hier-expand${hasChildren ? '' : ' is-empty'}`}
        size="small"
        onClick={handleExpand}
        aria-label={
          hasChildren ? (expanded ? t('common.collapse') : t('common.expand')) : undefined
        }
        tabIndex={hasChildren ? 0 : -1}
      >
        {hasChildren ? (
          <Icon
            icon={expanded ? 'material-symbols:caret-down' : 'material-symbols:caret-right'}
            aria-hidden
          />
        ) : null}
      </IconButton>

      <KindIcon kind={node.kind} />

      <span className="hier-name">
        {node.name}
        {node.childCount > 0 ? <span className="hier-count"> ({node.childCount})</span> : null}
      </span>

      {node.id !== 'scene-root' ? (
        <>
          <IconButton
            className={`hier-copy${nameCopied ? ' is-copied' : ''}`}
            size="small"
            onClick={handleCopyName}
            title={nameCopied ? t('hierarchy.copied') : t('hierarchy.copyName')}
            aria-label={nameCopied ? t('hierarchy.copied') : t('hierarchy.copyName')}
          >
            <Icon
              icon={nameCopied ? 'material-symbols:check' : 'material-symbols:content-copy'}
              aria-hidden
            />
          </IconButton>
          <IconButton
            className={`hier-eye${node.visible ? '' : ' is-off'}`}
            size="small"
            onClick={handleEye}
            title={node.visible ? t('common.hide') : t('common.show')}
            aria-label={node.visible ? t('common.hide') : t('common.show')}
          >
            <Icon
              icon={node.visible ? 'material-symbols:visibility' : 'material-symbols:visibility-off'}
              aria-hidden
            />
          </IconButton>
        </>
      ) : (
        <>
          <span className="hier-copy-spacer" />
          <span className="hier-eye-spacer" />
        </>
      )}
    </div>
  )
})

function VirtualTree({
  rows,
  selectedId,
  expanded,
  onToggleExpand,
  onSelect,
  onToggleVisible,
  scrollToId,
}: {
  rows: FlatHierarchyRow[]
  selectedId: string | null
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onSelect: (id: string | null) => void
  onToggleVisible: (id: string) => void
  scrollToId: string | null
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(240)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const update = () => setViewportHeight(el.clientHeight || 240)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!scrollToId) return
    const index = rows.findIndex(row => row.node.id === scrollToId)
    if (index < 0) return
    const el = scrollerRef.current
    if (!el) return
    const top = index * ROW_HEIGHT_PX
    const bottom = top + ROW_HEIGHT_PX
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
  }, [scrollToId, rows])

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }

  const totalHeight = rows.length * ROW_HEIGHT_PX
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN)
  const end = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT_PX) + OVERSCAN
  )
  const visible = rows.slice(start, end)

  return (
    <div className="hier-tree" ref={scrollerRef} onScroll={onScroll}>
      <div className="hier-tree-spacer" style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((row, i) => {
          const index = start + i
          return (
            <div
              key={row.node.id}
              className="hier-tree-row-abs"
              style={{
                position: 'absolute',
                top: index * ROW_HEIGHT_PX,
                left: 0,
                right: 0,
                height: ROW_HEIGHT_PX,
              }}
            >
              <TreeRow
                node={row.node}
                depth={row.depth}
                selected={selectedId === row.node.id}
                expanded={expanded.has(row.node.id)}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                onToggleVisible={onToggleVisible}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function HierarchyPanel({
  open,
  modelKey,
  root,
  paths,
  selectedId,
  onOpenChange,
  onSelect,
  onToggleVisible,
}: HierarchyPanelProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['scene-root']))
  const [treeCopied, setTreeCopied] = useState(false)
  const treeCopyTimer = useRef(0)
  const rootRef = useRef(root)
  rootRef.current = root
  const rootReady = Boolean(root)

  useEffect(() => {
    setQuery('')
    setTreeCopied(false)
  }, [modelKey])

  useEffect(() => {
    return () => window.clearTimeout(treeCopyTimer.current)
  }, [])

  const copyTree = () => {
    if (!root) return
    const tree = hierarchyClipboardTree(root)
    if (!tree) return
    void writeClipboard(JSON.stringify(tree, null, 2))
      .then(() => {
        setTreeCopied(true)
        window.clearTimeout(treeCopyTimer.current)
        treeCopyTimer.current = window.setTimeout(() => setTreeCopied(false), COPY_FEEDBACK_MS)
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!root) return
    setExpanded(collectAllExpandIds(root))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit `root`
  }, [modelKey, rootReady])

  useEffect(() => {
    if (!open) return
    const current = rootRef.current
    if (current) setExpanded(collectAllExpandIds(current))
  }, [open])

  useEffect(() => {
    if (!selectedId) return
    const path = paths?.get(selectedId)
    if (!path) return
    setExpanded(prev => {
      let needs = false
      for (const id of path) {
        if (!prev.has(id)) {
          needs = true
          break
        }
      }
      if (!needs) return prev
      const next = new Set(prev)
      for (const id of path) next.add(id)
      return next
    })
  }, [paths, selectedId])

  const filtered = useMemo(() => {
    if (!root) return null
    return filterHierarchy(root, query)
  }, [root, query])

  useEffect(() => {
    if (!filtered || !query.trim()) return
    setExpanded(collectAllExpandIds(filtered))
  }, [filtered, query])

  const flatRows = useMemo(() => {
    if (!filtered) return []
    return flattenHierarchy(filtered, expanded)
  }, [filtered, expanded])

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const { width, onResizePointerDown } = usePanelWidth('hierarchy')

  if (!open) return null

  return (
    <div className="hier-panel" style={{ width }}>
      <div className="hier-header">
        <span className="hier-header-title">{t('tool.hierarchy')}</span>
        <span className="hier-header-actions">
          <IconButton
            className={`hier-copy${treeCopied ? ' is-copied' : ''}`}
            size="small"
            onClick={copyTree}
            disabled={!root || root.children.length === 0}
            title={treeCopied ? t('hierarchy.copied') : t('hierarchy.copyTree')}
            aria-label={treeCopied ? t('hierarchy.copied') : t('hierarchy.copyTree')}
          >
            <Icon
              icon={treeCopied ? 'material-symbols:check' : 'material-symbols:content-copy'}
              aria-hidden
            />
          </IconButton>
          <IconButton
            className="hier-close"
            size="small"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
          >
            <Icon icon="material-symbols:close" aria-hidden />
          </IconButton>
        </span>
      </div>

      <PanelSearchField
        className="hier-search"
        placeholder={t('hierarchy.searchPlaceholder')}
        value={query}
        aria-label={t('hierarchy.search')}
        onChange={setQuery}
      />

      {filtered ? (
        <VirtualTree
          rows={flatRows}
          selectedId={selectedId}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onSelect={onSelect}
          onToggleVisible={onToggleVisible}
          scrollToId={selectedId}
        />
      ) : (
        <div className="hier-tree">
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
        </div>
      )}
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
