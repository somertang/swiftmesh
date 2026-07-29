import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { ViewerScene, type CaptureHandle, type RecordDrive } from './components/ViewerScene'
import { BlockGridLoader } from './components/BlockGridLoader'
import { StripeCircularLoader } from './components/StripeCircularLoader'
import { ExportProgressModal } from './components/ExportProgressModal'
import { ModelTabBar } from './components/ModelTabBar'
import { AppTitleBar } from './components/AppTitleBar'
import { PreferencesModal } from './components/PreferencesModal'
import { SceneSettingsPanels } from './components/SceneSettingsPanels'
import { DEFAULT_CAMERA } from './config/cameraDefaults'
import { captureFrameSequence } from './lib/recordCanvas'
import {
  getRecordingSizePreset,
  normalizeRecordingQuality,
  RECORDING_EXPORT_FORMAT_OPTIONS,
  RECORDING_QUALITY_OPTIONS,
  RECORDING_SIZE_PRESETS,
  renderScaleForQuality,
  toEvenDimension,
  resolveRecordingOutputSize,
} from './lib/recordingPresets'
import { readPreferences } from './lib/preferences'
import type { OpenedModel, RecordingExportFormat } from './desktopTypes'
import { MODEL_FILE_ACCEPT } from './lib/modelSource'
import { ModelResolveError, modelSourceFromFiles, modelSourceFromOpened } from './lib/resolveModelSource'
import {
  createEmptyTab,
  createInitialTabState,
  DEFAULT_SECONDS_PER_REV,
  focusGroup,
  getActiveTab,
  getGroup,
  getGroupTabs,
  canRevealModelPath,
  openErrorInTabs,
  openModelInTabs,
  patchActiveTab,
  patchTab,
  reorderTabs,
  revokeAllTabModels,
  revokeTabModel,
  selectTabInGroup,
  splitEditor,
  moveTabToGroup,
  tabTitle,
  unsplitIfNeeded,
  type ModelTab,
  type TabState,
} from './lib/modelTab'
import logoUrl from './assets/logo.png'
import { Icon } from './icons'
import { useT, type MessageKey } from './i18n'
import './styles.css'

function FieldRow({
  id,
  label,
  children,
}: {
  id?: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="field-row">
      {id ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className="field-label">{label}</span>
      )}
      <div className="field-control">{children}</div>
    </div>
  )
}

export default function App() {
  const t = useT()
  const [tabState, setTabState] = useState<TabState>(createInitialTabState)
  const [dragOver, setDragOver] = useState(false)
  const [statusBarVisible, setStatusBarVisible] = useState(false)
  const [recordPopoverGroupId, setRecordPopoverGroupId] = useState<string | null>(null)
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  const activeTab = getActiveTab(tabState)
  const {
    model,
    loading,
    recording,
    exporting,
    exportPhase,
    progressRad,
  } = activeTab

  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const captureHandleRefs = useRef<Record<string, { current: CaptureHandle | null }>>({})
  const abortRef = useRef({ aborted: false })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const tabStateRef = useRef(tabState)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  tabStateRef.current = tabState

  const driveRefs = useRef<Record<string, { current: RecordDrive }>>({})
  const getDriveRef = (groupId: string) =>
    (driveRefs.current[groupId] ??= {
      current: {
        active: false,
        radiansPerSecond: (Math.PI * 2) / DEFAULT_SECONDS_PER_REV,
        onProgress: () => {},
        onComplete: () => {},
      },
    })

  useEffect(() => {
    return () => {
      revokeAllTabModels(tabStateRef.current.tabs)
    }
  }, [])


  const patchActive = useCallback((patch: Partial<(typeof activeTab)>) => {
    setTabState(prev => patchActiveTab(prev, patch))
  }, [])

  const applyOpenedModel = useCallback((file: OpenedModel) => {
    const source = modelSourceFromOpened(file)
    setTabState(prev => openModelInTabs(prev, source))
    canvasRefs.current[tabStateRef.current.focusedGroupId] = null
  }, [])

  const applyBrowserFiles = useCallback(async (files: File[] | FileList, nativePath: string | null = null) => {
    try {
      const source = await modelSourceFromFiles(files, nativePath)
      setTabState(prev => openModelInTabs(prev, source))
      canvasRefs.current[tabStateRef.current.focusedGroupId] = null
      if (nativePath && window.desktop?.rememberRecentPath) {
        void window.desktop.rememberRecentPath(nativePath)
      }
    } catch (err) {
      const message =
        err instanceof ModelResolveError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('error.openFailed')
      setTabState(prev => openErrorInTabs(prev, message))
    }
  }, [t])

  const handleOpenModel = useCallback(async () => {
    if (recording || exporting) return
    if (window.desktop) {
      try {
        const file = await window.desktop.openModel()
        if (file) applyOpenedModel(file)
      } catch (err) {
        patchActive({ error: err instanceof Error ? err.message : t('error.openFileFailed') })
      }
      return
    }
    fileInputRef.current?.click()
  }, [recording, exporting, applyOpenedModel, patchActive, t])

  const handleOpenRecentPath = useCallback(
    async (filePath: string) => {
      if (recording || exporting || !window.desktop) return
      try {
        const file = await window.desktop.readModelPath(filePath)
        applyOpenedModel(file)
      } catch (err) {
        patchActive({ error: err instanceof Error ? err.message : t('error.openFileFailed') })
      }
    },
    [recording, exporting, applyOpenedModel, patchActive, t]
  )

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    const first = files[0]!
    const nativePath = window.desktop?.getPathForFile(first) || null
    if (nativePath && window.desktop && files.length === 1) {
      void window.desktop
        .readModelPath(nativePath)
        .then(applyOpenedModel)
        .catch(() => {
          void applyBrowserFiles(files, nativePath)
        })
      return
    }
    void applyBrowserFiles(files, nativePath)
  }

  useEffect(() => {
    if (!window.desktop) return

    const unsub = window.desktop.onModelOpened(file => {
      const tab = getActiveTab(tabStateRef.current)
      if (tab.recording || tab.exporting) return
      applyOpenedModel(file)
    })

    let cancelled = false
    void (async () => {
      if (!window.desktop?.takePendingOpenPaths) return
      try {
        const paths = await window.desktop.takePendingOpenPaths()
        if (cancelled || paths.length === 0) return
        for (const filePath of paths) {
          if (cancelled) return
          const tab = getActiveTab(tabStateRef.current)
          if (tab.recording || tab.exporting) return
          try {
            const file = await window.desktop.readModelPath(filePath)
            if (cancelled) return
            applyOpenedModel(file)
          } catch (err) {
            if (cancelled) return
            const message = err instanceof Error ? err.message : t('error.openFileFailed')
            setTabState(prev => openErrorInTabs(prev, message))
          }
        }
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
      unsub()
    }
  }, [applyOpenedModel, t])

  useEffect(() => {
    if (!window.desktop) return
    return window.desktop.onExportProgress(({ stage, percent }) => {
      setTabState(prev =>
        patchActiveTab(prev, { exportPhase: { kind: 'encoding', stage, percent } })
      )
    })
  }, [])

  const toggleStatusBar = useCallback(() => {
    setStatusBarVisible(prev => !prev)
  }, [])

  useEffect(() => {
    if (!window.desktop?.onToggleStatusBar) return
    return window.desktop.onToggleStatusBar(toggleStatusBar)
  }, [toggleStatusBar])

  useEffect(() => {
    if (!window.desktop?.onOpenPreferences) return
    return window.desktop.onOpenPreferences(() => {
      setPreferencesOpen(true)
    })
  }, [])

  const selectTab = useCallback(
    (groupId: string, id: string) => {
      if (recording || exporting) return
      setTabState(prev => selectTabInGroup(prev, groupId, id))
      canvasRefs.current[groupId] = null
    },
    [recording, exporting]
  )

  const addTab = useCallback((groupId: string) => {
    if (recording || exporting) return
    const tab = createEmptyTab()
    setTabState(prev => {
      const group = getGroup(prev, groupId)
      return {
        ...prev,
        focusedGroupId: group.id,
        tabs: [...prev.tabs, tab],
        groups: prev.groups.map(candidate =>
          candidate.id === group.id
            ? { ...candidate, tabIds: [...candidate.tabIds, tab.id], activeTabId: tab.id }
            : candidate
        ),
      }
    })
    canvasRefs.current[groupId] = null
  }, [recording, exporting])

  const closeTab = useCallback((groupId: string, id: string) => {
    setTabState(prev => {
      const group = getGroup(prev, groupId)
      const idx = group.tabIds.indexOf(id)
      const closing = prev.tabs.find(tab => tab.id === id)
      if (idx < 0 || !closing) return prev
      if (closing.recording || closing.exporting) return prev
      revokeTabModel(closing)
      const tabs = prev.tabs.filter(tab => tab.id !== id)
      const tabIds = group.tabIds.filter(tabId => tabId !== id)
      if (tabIds.length === 0 && prev.groups.length === 1) {
        const empty = createEmptyTab()
        return {
          ...prev,
          tabs: [...tabs, empty],
          groups: [{ ...group, tabIds: [empty.id], activeTabId: empty.id }],
        }
      }
      const nextGroup = {
        ...group,
        tabIds,
        activeTabId: id === group.activeTabId ? tabIds[Math.min(idx, tabIds.length - 1)]! : group.activeTabId,
      }
      return unsplitIfNeeded({
        ...prev,
        tabs,
        groups: prev.groups.map(candidate => (candidate.id === group.id ? nextGroup : candidate)),
      })
    })
    canvasRefs.current[groupId] = null
  }, [])

  const closeTabsByPredicate = useCallback((groupId: string, shouldClose: (tab: ModelTab, index: number) => boolean) => {
    setTabState(prev => {
      const group = getGroup(prev, groupId)
      const groupTabs = getGroupTabs(prev, group.id)
      const kept: ModelTab[] = []
      for (let i = 0; i < groupTabs.length; i++) {
        const tab = groupTabs[i]!
        const busy = tab.recording || tab.exporting
        if (busy || !shouldClose(tab, i)) {
          kept.push(tab)
        } else {
          revokeTabModel(tab)
        }
      }
      if (kept.length === 0 && prev.groups.length === 1) {
        const empty = createEmptyTab()
        return {
          ...prev,
          tabs: prev.tabs.filter(tab => !group.tabIds.includes(tab.id)).concat(empty),
          groups: [{ ...group, tabIds: [empty.id], activeTabId: empty.id }],
        }
      }
      const keptIds = kept.map(tab => tab.id)
      const activeIndex = group.tabIds.indexOf(group.activeTabId)
      const nextGroup = {
        ...group,
        tabIds: keptIds,
        activeTabId: keptIds.includes(group.activeTabId)
          ? group.activeTabId
          : keptIds[Math.min(Math.max(activeIndex, 0), keptIds.length - 1)]!,
      }
      return unsplitIfNeeded({
        ...prev,
        tabs: prev.tabs.filter(tab => !group.tabIds.includes(tab.id) || keptIds.includes(tab.id)),
        groups: prev.groups.map(candidate => (candidate.id === group.id ? nextGroup : candidate)),
      })
    })
    canvasRefs.current[groupId] = null
  }, [])

  const closeOtherTabs = useCallback(
    (groupId: string, id: string) => {
      closeTabsByPredicate(groupId, tab => tab.id !== id)
    },
    [closeTabsByPredicate]
  )

  const closeTabsToRight = useCallback(
    (groupId: string, id: string) => {
      const sourceIndex = getGroup(tabStateRef.current, groupId).tabIds.indexOf(id)
      if (sourceIndex < 0) return
      closeTabsByPredicate(groupId, (_tab, index) => index > sourceIndex)
    },
    [closeTabsByPredicate]
  )

  const closeAllTabs = useCallback((groupId: string) => {
    closeTabsByPredicate(groupId, () => true)
  }, [closeTabsByPredicate])

  const revealTabInExplorer = useCallback((id: string) => {
    const tab = tabStateRef.current.tabs.find(t => t.id === id)
    const filePath = tab?.model?.path
    if (!canRevealModelPath(filePath) || !window.desktop?.showItemInFolder) return
    void window.desktop.showItemInFolder(filePath)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod || event.altKey) {
        /* continue to other shortcuts below */
      } else if (event.key.toLowerCase() === 'b' && !event.shiftKey) {
        event.preventDefault()
        toggleStatusBar()
        return
      } else if (event.key.toLowerCase() === 'o' && !event.shiftKey) {
        event.preventDefault()
        void handleOpenModel()
        return
      } else if (event.key === ',' && !event.shiftKey) {
        event.preventDefault()
        setPreferencesOpen(true)
        return
      }

      if (event.key === 'F4' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        const group = getGroup(tabStateRef.current, tabStateRef.current.focusedGroupId)
        closeTab(group.id, group.activeTabId)
        return
      }

      if (event.key === '\\' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault()
        setTabState(prev => splitEditor(prev, event.altKey ? 'down' : 'right'))
        return
      }

      if (
        event.key.toLowerCase() === 'r' &&
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault()
        revealTabInExplorer(getActiveTab(tabStateRef.current).id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleStatusBar, closeTab, revealTabInExplorer, handleOpenModel])

  const reorderTab = useCallback(
    (groupId: string, fromId: string, toIndex: number) => {
      if (recording || exporting) return
      setTabState(prev => reorderTabs(focusGroup(prev, groupId), fromId, toIndex))
    },
    [recording, exporting]
  )

  const transferTab = useCallback(
    (tabId: string, targetGroupId: string, toIndex: number) => {
      if (recording || exporting) return
      setTabState(prev => moveTabToGroup(prev, tabId, targetGroupId, toIndex))
    },
    [recording, exporting]
  )

  const startRecording = async (groupId: string) => {
    setTabState(prev => focusGroup(prev, groupId))
    const state = focusGroup(tabStateRef.current, groupId)
    const tab = getActiveTab(state, groupId)
    const patchRecordingTab = (patch: Partial<ModelTab>) => {
      setTabState(prev => patchTab(prev, tab.id, patch))
    }

    patchRecordingTab({ error: null })
    const canvas = canvasRefs.current[groupId]
    if (!canvas || !tab.model) {
      patchRecordingTab({ error: t('error.loadBeforeRecord') })
      return
    }
    const captureHandle = captureHandleRefs.current[groupId]?.current
    if (!captureHandle) {
      patchRecordingTab({ error: t('error.sceneNotReady') })
      return
    }

    if (!window.desktop) {
      patchRecordingTab({ error: t('error.desktopUnavailable') })
      return
    }

    const stem = tab.model.label || 'model'
    const fps = 30
    const quality = normalizeRecordingQuality(tab.recordingQuality)
    const totalFrames = Math.ceil(tab.secondsPerRevolution * fps)
    const sizePreset = getRecordingSizePreset(tab.recordingSizeId)
    const outputSize = resolveRecordingOutputSize(canvas, sizePreset)
    const requestedScale =
      sizePreset.width != null && sizePreset.width >= 3840 && quality !== 'standard'
        ? 1
        : renderScaleForQuality(quality)
    let plannedCapture = captureHandle.planCapture(outputSize, requestedScale)

    const runPreflight = async (): Promise<void> => {
      const rotations = [0, Math.PI / 6]
      for (const rotationY of rotations) {
        await captureHandle.captureFrame(rotationY, plannedCapture.outputSize, plannedCapture.renderScale)
      }
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await runPreflight()
        break
      } catch (error) {
        if (attempt === 2) {
          const reason = error instanceof Error ? error.message : String(error)
          patchRecordingTab({ error: `${t('error.recordingPreflightFailed')}: ${reason}` })
          return
        }

        const degradedSize = {
          width: toEvenDimension(Math.max(2, Math.floor(plannedCapture.outputSize.width * 0.85))),
          height: toEvenDimension(Math.max(2, Math.floor(plannedCapture.outputSize.height * 0.85))),
        }
        const degradedScale = Math.max(1, plannedCapture.renderScale - 0.5)
        const nextPlan = captureHandle.planCapture(degradedSize, degradedScale)
        const unchanged =
          nextPlan.renderScale === plannedCapture.renderScale &&
          nextPlan.outputSize.width === plannedCapture.outputSize.width &&
          nextPlan.outputSize.height === plannedCapture.outputSize.height
        if (unchanged) {
          const reason = error instanceof Error ? error.message : String(error)
          patchRecordingTab({ error: `${t('error.recordingPreflightFailed')}: ${reason}` })
          return
        }
        plannedCapture = {
          ...nextPlan,
          adjusted: true,
          reason: nextPlan.reason ?? t('error.recordingAutoAdjusted'),
        }
      }
    }

    if (plannedCapture.adjusted) {
      // Non-fatal notice: we prioritize stable export on older/integrated GPUs.
      patchRecordingTab({
        error: plannedCapture.reason ?? t('error.recordingAutoAdjusted'),
      })
    }

    const sessionRes = await window.desktop.startRecordingSession({
      defaultName: `${stem}-turntable`,
      format: tab.recordingExportFormat,
      quality,
      fps,
    })
    if (!sessionRes.ok) {
      patchRecordingTab({ error: sessionRes.reason })
      return
    }

    const abort = { aborted: false }
    abortRef.current = abort

    patchRecordingTab({
      recording: true,
      progressRad: 0,
      exportPhase: { kind: 'capturing', done: 0, total: totalFrames },
    })

    try {
      const frameCount = await captureFrameSequence({
        captureHandle,
        totalFrames,
        outputSize: plannedCapture.outputSize,
        renderScale: plannedCapture.renderScale,
        signal: abort,
        onFrame: (index, pngData) =>
          window.desktop!.appendRecordingFrame({
            sessionId: sessionRes.sessionId,
            index,
            data: pngData,
          }),
        onProgress: (done, total) => {
          setTabState(prev =>
            patchTab(prev, tab.id, {
              progressRad: (done / total) * Math.PI * 2,
              exportPhase: { kind: 'capturing', done, total },
            })
          )
        },
      })

      if (abort.aborted || frameCount <= 0) {
        throw new Error(t('error.noFrames'))
      }

      patchRecordingTab({
        recording: false,
        exporting: true,
        exportPhase: { kind: 'encoding', stage: t('error.encodingStarting'), percent: 0 },
      })

      const result = await window.desktop.finishRecordingSession({
        sessionId: sessionRes.sessionId,
        frameCount,
        fps,
        outputDir: readPreferences().recording.outputDir,
      })
      if (!result.ok && result.reason !== 'canceled') {
        patchRecordingTab({ error: result.reason || t('error.saveRecording') })
      }
    } catch (err) {
      patchRecordingTab({ error: err instanceof Error ? err.message : t('error.recordingFailed') })
    } finally {
      patchRecordingTab({
        recording: false,
        exporting: false,
        exportPhase: { kind: 'idle' },
        progressRad: 0,
      })
    }
  }

  const stopRecording = () => {
    if (!recording || exporting) return
    if (!window.confirm(t('record.stopConfirm'))) return
    abortRef.current.aborted = true
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const onRecordButtonPointerDown = (groupId: string) => {
    const locked = tabStateRef.current.tabs.some(tab => tab.recording || tab.exporting)
    const groupTab = getActiveTab(tabStateRef.current, groupId)
    if (locked || groupTab.loading || !groupTab.model) return
    setTabState(prev => focusGroup(prev, groupId))
    longPressTriggeredRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      setRecordPopoverGroupId(groupId)
    }, 450)
  }

  const onRecordButtonPointerUp = (groupId: string) => {
    const locked = tabStateRef.current.tabs.some(tab => tab.recording || tab.exporting)
    const groupTab = getActiveTab(tabStateRef.current, groupId)
    if (locked || groupTab.loading || !groupTab.model) return
    const triggered = longPressTriggeredRef.current
    clearLongPressTimer()
    if (!triggered) {
      void startRecording(groupId)
    }
  }

  const onRecordButtonPointerLeave = () => {
    clearLongPressTimer()
  }

  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    if (recording || exporting) return
    setDragOver(true)
  }

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
  }

  const onDrop = async (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    if (recording || exporting) return

    const files = event.dataTransfer.files
    if (!files || files.length === 0) return

    const first = files[0]!
    const nativePath = window.desktop?.getPathForFile(first)
    if (nativePath && window.desktop && files.length === 1) {
      try {
        const opened = await window.desktop.readModelPath(nativePath)
        applyOpenedModel(opened)
        return
      } catch (err) {
        patchActive({ error: err instanceof Error ? err.message : t('error.openFailed') })
        return
      }
    }
    await applyBrowserFiles(files, nativePath || null)
  }

  const progressPct = Math.min(100, (progressRad / (Math.PI * 2)) * 100)
  const sessionLocked = tabState.tabs.some(tab => tab.recording || tab.exporting)
  const pickerDisabled = sessionLocked

  useEffect(() => {
    if (sessionLocked) {
      setRecordPopoverGroupId(null)
      return
    }
    if (
      recordPopoverGroupId &&
      !getActiveTab(tabState, recordPopoverGroupId).model
    ) {
      setRecordPopoverGroupId(null)
    }
  }, [sessionLocked, recordPopoverGroupId, tabState])

  const fileInput = (
    <input
      ref={fileInputRef}
      id="model-file"
      type="file"
      accept={MODEL_FILE_ACCEPT}
      multiple
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden
      onChange={handleFileChange}
      disabled={pickerDisabled}
    />
  )

  const openButton = (
    <button
      type="button"
      className="btn btn-primary model-pick-btn"
      disabled={pickerDisabled}
      onClick={() => void handleOpenModel()}
    >
      {t('app.openFile')}
    </button>
  )
  const getCaptureRef = (groupId: string) =>
    (captureHandleRefs.current[groupId] ??= { current: null })

  return (
    <div className={`app${window.desktop ? ' has-custom-titlebar' : ''}`}>
      {window.desktop ? (
        <AppTitleBar
          title={model?.label ?? 'SwiftMesh'}
          onOpenFile={() => void handleOpenModel()}
          onOpenPreferences={() => setPreferencesOpen(true)}
          onToggleStatusBar={toggleStatusBar}
          onOpenRecentPath={filePath => void handleOpenRecentPath(filePath)}
        />
      ) : null}
      <main
        className={`viewport${dragOver ? ' is-dragover' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={event => {
          void onDrop(event)
        }}
      >
        {fileInput}
        <div
          className={`editor-groups${tabState.groups.length === 2 ? ` is-split-${tabState.splitDirection}` : ''}`}
          style={
            tabState.groups.length === 2
              ? ({ '--split-ratio': tabState.splitRatio } as CSSProperties)
              : undefined
          }
        >
          {tabState.groups.map((group, index) => {
            const groupTab = getActiveTab(tabState, group.id)
            const groupLocked = sessionLocked
            return (
              <div
                key={group.id}
                className={`editor-pane${group.id === tabState.focusedGroupId ? ' is-focused' : ''}`}
                onPointerDown={() => {
                  if (!sessionLocked) setTabState(prev => focusGroup(prev, group.id))
                }}
              >
                <ModelTabBar
                  groupId={group.id}
                  tabs={getGroupTabs(tabState, group.id).map(tab => ({
                    id: tab.id,
                    title: tabTitle(tab, t('app.tab.new')),
                    format: tab.model?.format ?? null,
                    path: tab.model?.path ?? null,
                  }))}
                  activeTabId={group.activeTabId}
                  locked={groupLocked}
                  canSplit={tabState.groups.length < 2}
                  onSelect={id => selectTab(group.id, id)}
                  onClose={id => closeTab(group.id, id)}
                  onCloseOthers={id => closeOtherTabs(group.id, id)}
                  onCloseToRight={id => closeTabsToRight(group.id, id)}
                  onCloseAll={() => closeAllTabs(group.id)}
                  onRevealInExplorer={revealTabInExplorer}
                  onAdd={() => addTab(group.id)}
                  onReorder={(fromId, toIndex) => reorderTab(group.id, fromId, toIndex)}
                  onTransfer={transferTab}
                  onSplitRight={id =>
                    setTabState(prev => splitEditor(selectTabInGroup(prev, group.id, id), 'right'))
                  }
                  onSplitDown={id =>
                    setTabState(prev => splitEditor(selectTabInGroup(prev, group.id, id), 'down'))
                  }
                />
                <div className="viewport-body">
                  {groupTab.error ? (
                    <div className="viewport-error-banner alert alert-error" role="alert">
                      <span className="viewport-error-banner-text">{groupTab.error}</span>
                      <button
                        type="button"
                        className="viewport-error-banner-close"
                        aria-label={t('common.close')}
                        title={t('common.close')}
                        onClick={() =>
                          setTabState(prev => patchTab(prev, groupTab.id, { error: null }))
                        }
                      >
                        <Icon icon="material-symbols:close" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                  {groupTab.model ? (
                    <>
                      <ViewerScene
                        key={`${group.id}-${groupTab.id}`}
                        model={groupTab.model}
                        cameraSettings={groupTab.camera}
                        lightingSettings={groupTab.lighting}
                        shadingMode={groupTab.shadingMode}
                        recording={groupTab.recording || groupTab.exporting}
                        secondsPerRevolution={groupTab.secondsPerRevolution}
                        driveRef={getDriveRef(group.id)}
                        onLoading={nextLoading =>
                          setTabState(prev => patchTab(prev, groupTab.id, { loading: nextLoading }))
                        }
                        onError={message =>
                          setTabState(prev => patchTab(prev, groupTab.id, { error: message }))
                        }
                        onCanvasReady={canvas => {
                          canvasRefs.current[group.id] = canvas
                        }}
                        captureRef={getCaptureRef(group.id)}
                      />
                      <SceneSettingsPanels
                        lighting={groupTab.lighting}
                        camera={groupTab.camera}
                        shadingMode={groupTab.shadingMode}
                        disabled={groupLocked || groupTab.loading}
                        onShadingModeChange={mode =>
                          setTabState(prev => patchTab(prev, groupTab.id, { shadingMode: mode }))
                        }
                        onLightingChange={patch =>
                          setTabState(prev =>
                            patchTab(prev, groupTab.id, {
                              lighting: { ...groupTab.lighting, ...patch },
                            })
                          )
                        }
                        onLightingReset={() =>
                          setTabState(prev =>
                            patchTab(prev, groupTab.id, { lighting: { ...readPreferences().lighting } })
                          )
                        }
                        onCameraChange={(key, value) =>
                          setTabState(prev =>
                            patchTab(prev, groupTab.id, {
                              camera: { ...groupTab.camera, [key]: value },
                            })
                          )
                        }
                        onCameraReset={() =>
                          setTabState(prev => patchTab(prev, groupTab.id, { camera: { ...DEFAULT_CAMERA } }))
                        }
                      />
                      {groupTab.loading ? (
                        <div className="overlay overlay--loading">
                          <BlockGridLoader aria-hidden />
                          <span>{t('app.loadingModel')}</span>
                        </div>
                      ) : null}
                      {groupTab.recording ? <div className="badge badge-error rec-badge">REC</div> : null}
                      <div className="record-fab-wrap">
                        <button
                          type="button"
                          className="record-fab btn btn-circle"
                          disabled={groupLocked || groupTab.loading}
                          aria-label={t('record.start')}
                          title={t('record.start')}
                          onPointerDown={() => onRecordButtonPointerDown(group.id)}
                          onPointerUp={() => onRecordButtonPointerUp(group.id)}
                          onPointerCancel={onRecordButtonPointerLeave}
                          onPointerLeave={onRecordButtonPointerLeave}
                        >
                          <span className="record-fab-inner" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="record-fab-settings"
                          disabled={groupLocked || groupTab.loading}
                          aria-label={t('record.settings')}
                          title={t('record.settings')}
                          onClick={() => {
                            setTabState(prev => focusGroup(prev, group.id))
                            setRecordPopoverGroupId(id => (id === group.id ? null : group.id))
                          }}
                        >
                          <Icon icon="material-symbols:adjust" aria-hidden />
                        </button>
                        {recordPopoverGroupId === group.id && !groupLocked ? (
                          <div className="record-popover" role="dialog" aria-label={t('record.settings')}>
                            <div className="record-popover-header">
                              <strong>{t('record.settings')}</strong>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => setRecordPopoverGroupId(null)}
                                aria-label={t('common.close')}
                                title={t('common.close')}
                              >
                                <Icon icon="material-symbols:close" aria-hidden />
                              </button>
                            </div>
                            <div className="record-popover-summary">
                              {`${groupTab.secondsPerRevolution}s/rev · ${groupTab.recordingExportFormat.toUpperCase()} · ${groupTab.recordingSizeId} · ${normalizeRecordingQuality(groupTab.recordingQuality)}`}
                            </div>
                            <p className="scene-settings-hint">{t('prefs.recording.hint')}</p>
                            <FieldRow id={`record-pop-seconds-${group.id}`} label={t('record.secPerRev')}>
                              <input
                                id={`record-pop-seconds-${group.id}`}
                                type="number"
                                className="input input-bordered input-sm"
                                min={3}
                                max={60}
                                step={1}
                                value={groupTab.secondsPerRevolution}
                                onChange={e =>
                                  setTabState(prev =>
                                    patchTab(prev, groupTab.id, {
                                      secondsPerRevolution:
                                        Number(e.target.value) || DEFAULT_SECONDS_PER_REV,
                                    })
                                  )
                                }
                              />
                            </FieldRow>
                            <FieldRow id={`record-pop-format-${group.id}`} label={t('record.export')}>
                              <select
                                id={`record-pop-format-${group.id}`}
                                className="select select-bordered select-sm"
                                value={groupTab.recordingExportFormat}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                  setTabState(prev =>
                                    patchTab(prev, groupTab.id, {
                                      recordingExportFormat: e.target.value as RecordingExportFormat,
                                    })
                                  )
                                }
                              >
                                {RECORDING_EXPORT_FORMAT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {t(`record.format.${opt.value}` as MessageKey)}
                                  </option>
                                ))}
                              </select>
                            </FieldRow>
                            <FieldRow id={`record-pop-size-${group.id}`} label={t('record.size')}>
                              <select
                                id={`record-pop-size-${group.id}`}
                                className="select select-bordered select-sm"
                                value={groupTab.recordingSizeId}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                  setTabState(prev =>
                                    patchTab(prev, groupTab.id, { recordingSizeId: e.target.value })
                                  )
                                }
                              >
                                {RECORDING_SIZE_PRESETS.map(preset => (
                                  <option key={preset.id} value={preset.id}>
                                    {t(`record.size.${preset.id}` as MessageKey)}
                                  </option>
                                ))}
                              </select>
                            </FieldRow>
                            <FieldRow id={`record-pop-quality-${group.id}`} label={t('record.quality')}>
                              <select
                                id={`record-pop-quality-${group.id}`}
                                className="select select-bordered select-sm"
                                value={normalizeRecordingQuality(groupTab.recordingQuality)}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                  setTabState(prev =>
                                    patchTab(prev, groupTab.id, {
                                      recordingQuality: normalizeRecordingQuality(e.target.value),
                                    })
                                  )
                                }
                              >
                                {RECORDING_QUALITY_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {t(`record.quality.${opt.value}` as MessageKey)}
                                  </option>
                                ))}
                              </select>
                            </FieldRow>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="empty flex flex-col items-center justify-center gap-3">
                      <div className="empty-brand flex flex-col items-center gap-2">
                        <img src={logoUrl} alt="" className="empty-brand-logo" />
                        <h1 className="empty-title text-2xl font-semibold">SwiftMesh</h1>
                      </div>
                      {openButton}
                      <div className="empty-hint max-w-md text-center text-sm opacity-70">{t('app.emptyHint')}</div>
                    </div>
                  )}
                </div>
                {index === 0 && tabState.groups.length === 2 ? (
                  <div
                    className="editor-splitter"
                    role="separator"
                    aria-orientation={tabState.splitDirection === 'down' ? 'horizontal' : 'vertical'}
                    onPointerDown={event => {
                      event.preventDefault()
                      const container = event.currentTarget.parentElement?.parentElement
                      if (!container) return
                      const rect = container.getBoundingClientRect()
                      const onMove = (moveEvent: PointerEvent) => {
                        const raw =
                          tabState.splitDirection === 'down'
                            ? (moveEvent.clientY - rect.top) / rect.height
                            : (moveEvent.clientX - rect.left) / rect.width
                        setTabState(prev => ({ ...prev, splitRatio: Math.max(0.2, Math.min(0.8, raw)) }))
                      }
                      const onUp = () => {
                        window.removeEventListener('pointermove', onMove)
                        window.removeEventListener('pointerup', onUp)
                      }
                      window.addEventListener('pointermove', onMove)
                      window.addEventListener('pointerup', onUp)
                    }}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
        <ExportProgressModal
          phase={exportPhase}
          canStop={recording && !exporting}
          stopLabel={t('record.stopRecording')}
          onStop={stopRecording}
        />
        {statusBarVisible ? (
          <div className="viewport-status">
              <div className="viewport-status-main">
                <span>
                  <strong>{t('app.status')}</strong>{' '}
                  {recording
                    ? t('app.status.recording')
                    : exporting
                      ? t('app.status.exporting')
                      : loading
                        ? t('app.status.loading')
                        : model
                          ? t('app.status.ready')
                          : t('app.status.noModel')}
                </span>
                <span>
                  <strong>{t('app.progress')}</strong> {progressPct.toFixed(0)}%
                </span>
                {model ? (
                  <span className="mono">
                    {t('app.model')}: {model.label}
                  </span>
                ) : null}
                {loading ? <StripeCircularLoader aria-hidden /> : null}
              </div>
          </div>
        ) : null}
      </main>

      <PreferencesModal open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
    </div>
  )
}
