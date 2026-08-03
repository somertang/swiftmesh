import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { Icon } from '../icons'
import { useT } from '../i18n'
import type { ModelFormat } from '../lib/modelSource'
import { canRevealModelPath } from '../lib/modelTab'
import {
  findEditorGroupIdAtPoint,
  publishTabDrag,
  subscribeTabDrag,
  type TabDragPointer,
} from '../lib/tabDragBridge'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type TabItem = {
  id: string
  title: string
  format: ModelFormat | null
  path: string | null
}

type ModelTabBarProps = {
  groupId: string
  tabs: TabItem[]
  activeTabId: string
  locked: boolean
  canSplit: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseToRight: (id: string) => void
  onCloseAll: () => void
  onRevealInExplorer: (id: string) => void
  onAdd: () => void
  onReorder: (fromId: string, toIndex: number) => void
  onTransfer: (tabId: string, targetGroupId: string, toIndex: number) => void
  onSplitRight: (tabId: string) => void
  onSplitDown: (tabId: string) => void
}

type DragState = {
  id: string
  title: string
  format: ModelFormat | null
  active: boolean
  width: number
  height: number
  offsetX: number
  offsetY: number
  x: number
  y: number
  /** Insert-before index in the current tabs array (0..length). */
  insertBefore: number
  overSelf: boolean
}

type DragSession = {
  id: string
  fromIndex: number
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  title: string
  format: ModelFormat | null
  active: boolean
  moved: boolean
}

type ContextMenuState = {
  tabId: string
  x: number
  y: number
}

function tabFormatIcon(format: ModelFormat | null): string {
  if (format === 'glb') return 'material-symbols:deployed-code'
  if (format === 'gltf') return 'material-symbols:view-in-ar'
  if (format === 'obj') return 'material-symbols:hexagon'
  return 'material-symbols:draft'
}

const DRAG_THRESHOLD_PX = 5
const EDGE_SCROLL_PX = 48
const EDGE_SCROLL_SPEED = 14

function insertBeforeFromPoint(list: HTMLElement, clientX: number, draggedId: string): number {
  const nodes = [...list.querySelectorAll<HTMLElement>('.model-tab')]
  for (const el of nodes) {
    if (el.dataset.tabId === draggedId) continue
    const rect = el.getBoundingClientRect()
    if (clientX < rect.left + rect.width / 2) {
      return Number(el.dataset.tabIndex)
    }
  }
  return nodes.filter(el => el.dataset.tabId !== draggedId).length
}

function resolveDropIndex(fromIndex: number, insertBefore: number, length: number): number {
  let insert = Math.max(0, Math.min(insertBefore, length))
  if (fromIndex < insert) insert -= 1
  return Math.max(0, Math.min(insert, length - 1))
}

function indicatorOffset(list: HTMLElement, insertBefore: number, draggedId: string | null): number {
  const tabNodes = [...list.querySelectorAll<HTMLElement>('.model-tab')].filter(
    el => el.dataset.tabId !== draggedId
  )
  const listRect = list.getBoundingClientRect()
  if (insertBefore <= 0) {
    const first = tabNodes[0]
    return first ? first.getBoundingClientRect().left - listRect.left + list.scrollLeft : 0
  }
  if (insertBefore >= tabNodes.length) {
    const last = tabNodes[tabNodes.length - 1]
    return last
      ? last.getBoundingClientRect().right - listRect.left + list.scrollLeft
      : list.scrollWidth
  }
  const target = tabNodes[insertBefore]
  if (target) {
    return target.getBoundingClientRect().left - listRect.left + list.scrollLeft
  }
  return 0
}

export function ModelTabBar({
  groupId,
  tabs,
  activeTabId,
  locked,
  canSplit,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onRevealInExplorer,
  onAdd,
  onReorder,
  onTransfer,
  onSplitRight,
  onSplitDown,
}: ModelTabBarProps) {
  const t = useT()
  const listRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<DragSession | null>(null)
  const tabsLenRef = useRef(tabs.length)
  tabsLenRef.current = tabs.length
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder
  const onTransferRef = useRef(onTransfer)
  onTransferRef.current = onTransfer
  const groupIdRef = useRef(groupId)
  groupIdRef.current = groupId
  const [drag, setDrag] = useState<DragState | null>(null)
  const [foreignInsertBefore, setForeignInsertBefore] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const suppressClickRef = useRef(false)

  const addTab = () => {
    if (locked) return
    onAdd()
    window.getSelection()?.removeAllRanges()
  }

  const handleBarDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (locked) return
    const target = event.target as HTMLElement
    if (
      target.closest(
        '.model-tab, .model-tab-close, .model-tab-add, .model-tab-split, .model-tab-context-menu'
      )
    ) {
      return
    }
    event.preventDefault()
    addTab()
  }

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onWheel = (event: WheelEvent) => {
      if (list.scrollWidth <= list.clientWidth) return
      const primarilyVertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      if (!primarilyVertical || event.deltaY === 0) return
      event.preventDefault()
      list.scrollLeft += event.deltaY
    }
    list.addEventListener('wheel', onWheel, { passive: false })
    return () => list.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('.model-tab.is-active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId, tabs.length])

  useEffect(() => {
    return subscribeTabDrag((pointer: TabDragPointer | null) => {
      const list = listRef.current
      if (!pointer || pointer.sourceGroupId === groupIdRef.current || !list) {
        setForeignInsertBefore(null)
        return
      }
      const rect = list.getBoundingClientRect()
      const over =
        pointer.clientX >= rect.left &&
        pointer.clientX <= rect.right &&
        pointer.clientY >= rect.top &&
        pointer.clientY <= rect.bottom
      if (!over) {
        setForeignInsertBefore(null)
        return
      }
      if (pointer.clientX < rect.left + EDGE_SCROLL_PX) list.scrollLeft -= EDGE_SCROLL_SPEED
      else if (pointer.clientX > rect.right - EDGE_SCROLL_PX) list.scrollLeft += EDGE_SCROLL_SPEED
      setForeignInsertBefore(insertBeforeFromPoint(list, pointer.clientX, pointer.tabId))
    })
  }, [])

  const finishDrag = useCallback((clientX: number, clientY: number) => {
    const session = sessionRef.current
    const list = listRef.current
    sessionRef.current = null
    setDrag(null)
    publishTabDrag(null)
    if (!session?.moved) return
    suppressClickRef.current = true

    const targetGroupId = findEditorGroupIdAtPoint(clientX, clientY)
    if (!targetGroupId) return

    if (targetGroupId === groupIdRef.current) {
      if (!list) return
      const insertBefore = insertBeforeFromPoint(list, clientX, session.id)
      const toIndex = resolveDropIndex(session.fromIndex, insertBefore, tabsLenRef.current)
      if (toIndex !== session.fromIndex) onReorderRef.current(session.id, toIndex)
      return
    }

    const targetList = document.querySelector<HTMLElement>(
      `[data-editor-group-id="${targetGroupId}"] .model-tab-list`
    )
    if (!targetList) return
    const toIndex = insertBeforeFromPoint(targetList, clientX, session.id)
    onTransferRef.current(session.id, targetGroupId, toIndex)
  }, [])

  const onTabPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    tab: TabItem,
    index: number,
    active: boolean
  ) => {
    if (locked) return
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.model-tab-close')) return

    const el = event.currentTarget
    const rect = el.getBoundingClientRect()
    sessionRef.current = {
      id: tab.id,
      fromIndex: index,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      title: tab.title,
      format: tab.format,
      active,
      moved: false,
    }

    const onMove = (ev: PointerEvent) => {
      const session = sessionRef.current
      const list = listRef.current
      if (!session || !list) return
      const dist = Math.hypot(ev.clientX - session.startX, ev.clientY - session.startY)
      if (!session.moved) {
        if (dist < DRAG_THRESHOLD_PX) return
        session.moved = true
        closeContextMenu()
      }

      const overGroupId = findEditorGroupIdAtPoint(ev.clientX, ev.clientY)
      const overSelf = overGroupId === groupIdRef.current

      if (overSelf) {
        const listRect = list.getBoundingClientRect()
        if (ev.clientX < listRect.left + EDGE_SCROLL_PX) list.scrollLeft -= EDGE_SCROLL_SPEED
        else if (ev.clientX > listRect.right - EDGE_SCROLL_PX) list.scrollLeft += EDGE_SCROLL_SPEED
      }

      publishTabDrag({
        sourceGroupId: groupIdRef.current,
        tabId: session.id,
        clientX: ev.clientX,
        clientY: ev.clientY,
      })

      setDrag({
        id: session.id,
        title: session.title,
        format: session.format,
        active: session.active,
        width: session.width,
        height: session.height,
        offsetX: session.offsetX,
        offsetY: session.offsetY,
        x: ev.clientX,
        y: ev.clientY,
        insertBefore: overSelf ? insertBeforeFromPoint(list, ev.clientX, session.id) : -1,
        overSelf,
      })
    }

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      finishDrag(ev.clientX, ev.clientY)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onTabContextMenu = (event: MouseEvent<HTMLDivElement>, tabId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      tabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const contextTab = contextMenu ? tabs.find(tab => tab.id === contextMenu.tabId) : null
  const contextIndex = contextTab ? tabs.findIndex(tab => tab.id === contextTab.id) : -1
  const canCloseContext =
    Boolean(contextTab) && !(locked && contextTab!.id === activeTabId)
  const canCloseOthers = tabs.length > 1
  const canCloseToRight = contextIndex >= 0 && contextIndex < tabs.length - 1
  const canReveal = canRevealModelPath(contextTab?.path)

  const runMenuAction = (action: () => void) => {
    action()
    closeContextMenu()
  }

  const localIndicatorLeft = (() => {
    const list = listRef.current
    if (!drag?.overSelf || !list) return null
    return indicatorOffset(list, drag.insertBefore, drag.id)
  })()

  const foreignIndicatorLeft = (() => {
    const list = listRef.current
    if (foreignInsertBefore == null || !list) return null
    return indicatorOffset(list, foreignInsertBefore, null)
  })()

  return (
    <div
      className="model-tab-bar"
      role="tablist"
      aria-label={t('app.tabs')}
      data-editor-group-id={groupId}
      onDoubleClick={handleBarDoubleClick}
    >
      <div ref={listRef} className="model-tab-list">
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId
          const selectDisabled = locked && !active
          const closeDisabled = locked && active
          const isDragging = drag?.id === tab.id
          return (
            <div
              key={tab.id}
              role="tab"
              data-tab-id={tab.id}
              data-tab-index={index}
              tabIndex={selectDisabled ? -1 : 0}
              aria-selected={active}
              aria-disabled={selectDisabled || undefined}
              className={`model-tab${active ? ' is-active' : ''}${selectDisabled ? ' is-disabled' : ''}${isDragging ? ' is-dragging' : ''}`}
              title={tab.title}
              onPointerDown={event => onTabPointerDown(event, tab, index, active)}
              onContextMenu={event => onTabContextMenu(event, tab.id)}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false
                  return
                }
                if (!selectDisabled) onSelect(tab.id)
              }}
              onKeyDown={event => {
                if (selectDisabled) return
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect(tab.id)
              }}
            >
              <Icon icon={tabFormatIcon(tab.format)} className="model-tab-icon" aria-hidden />
              <span className="model-tab-label">{tab.title}</span>
              <button
                type="button"
                className="model-tab-close"
                tabIndex={closeDisabled ? -1 : 0}
                disabled={closeDisabled}
                aria-label={t('app.tab.close', { title: tab.title })}
                title={t('common.close')}
                onClick={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!closeDisabled) onClose(tab.id)
                }}
              >
                <Icon icon="material-symbols:close" aria-hidden />
              </button>
            </div>
          )
        })}
        {localIndicatorLeft != null ? (
          <div
            className="model-tab-drop-indicator"
            style={{ transform: `translateX(${localIndicatorLeft}px)` }}
            aria-hidden
          />
        ) : null}
        {foreignIndicatorLeft != null ? (
          <div
            className="model-tab-drop-indicator"
            style={{ transform: `translateX(${foreignIndicatorLeft}px)` }}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="model-tab-actions">
        <IconButton
          className="model-tab-add"
          disabled={locked}
          aria-label={t('app.tab.new')}
          title={t('app.tab.new')}
          onClick={addTab}
        >
          <Icon icon="material-symbols:add" width="1.1rem" height="1.1rem" aria-hidden />
        </IconButton>
        <IconButton
          className="model-tab-split"
          disabled={locked || !canSplit}
          aria-label={t('app.tab.splitRight')}
          title={t('app.tab.splitRightTooltip')}
          onClick={event => {
            if (locked || !canSplit) return
            if (event.altKey) onSplitDown(activeTabId)
            else onSplitRight(activeTabId)
          }}
        >
          <Icon icon="material-symbols:split-scene-outline-sharp" width="1.1rem" height="1.1rem" aria-hidden />
        </IconButton>
      </div>
      {drag ? (
        <div
          className={`model-tab model-tab-ghost${drag.active ? ' is-active' : ''}`}
          style={{
            width: drag.width,
            height: drag.height,
            transform: `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)`,
          }}
          aria-hidden
        >
          <Icon icon={tabFormatIcon(drag.format)} className="model-tab-icon" aria-hidden />
          <span className="model-tab-label">{drag.title}</span>
          <span className="model-tab-close is-ghost-close" aria-hidden>
            <Icon icon="material-symbols:close" aria-hidden />
          </span>
        </div>
      ) : null}
      <Menu
        open={Boolean(contextMenu && contextTab)}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu
            ? {
                top: Math.min(contextMenu.y, window.innerHeight - 220),
                left: Math.min(contextMenu.x, window.innerWidth - 260),
              }
            : undefined
        }
        slotProps={{
          list: { dense: true, className: 'model-tab-context-menu' },
        }}
      >
        {contextTab ? (
          <>
            <MenuItem
              disabled={!canCloseContext}
              onClick={() => runMenuAction(() => onClose(contextTab.id))}
            >
              <ListItemText primary={t('app.tab.closeMenu')} />
              <kbd className="ml-6 font-sans text-xs opacity-60">Ctrl+F4</kbd>
            </MenuItem>
            <MenuItem
              disabled={!canCloseOthers}
              onClick={() => runMenuAction(() => onCloseOthers(contextTab.id))}
            >
              {t('app.tab.closeOthers')}
            </MenuItem>
            <MenuItem
              disabled={!canCloseToRight}
              onClick={() => runMenuAction(() => onCloseToRight(contextTab.id))}
            >
              {t('app.tab.closeToRight')}
            </MenuItem>
            <MenuItem onClick={() => runMenuAction(() => onCloseAll())}>
              {t('app.tab.closeAll')}
            </MenuItem>
            <Divider component="li" />
            <MenuItem
              disabled={locked || !canSplit}
              onClick={() => runMenuAction(() => onSplitRight(contextTab.id))}
            >
              {t('app.tab.splitRight')}
            </MenuItem>
            <MenuItem
              disabled={locked || !canSplit}
              onClick={() => runMenuAction(() => onSplitDown(contextTab.id))}
            >
              {t('app.tab.splitDown')}
            </MenuItem>
            <Divider component="li" />
            <MenuItem
              disabled={!canReveal}
              onClick={() => runMenuAction(() => onRevealInExplorer(contextTab.id))}
            >
              <ListItemText primary={t('app.tab.revealInExplorer')} />
              <kbd className="ml-6 font-sans text-xs opacity-60">Shift+Alt+R</kbd>
            </MenuItem>
          </>
        ) : null}
      </Menu>
    </div>
  )
}
