import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type CSSProperties,
} from 'react'
import { ViewerScene, type CaptureHandle, type RecordDrive } from './components/ViewerScene'
import { BlockGridLoader } from './components/BlockGridLoader'
import { ExportProgressModal } from './components/ExportProgressModal'
import { ModelTabBar } from './components/ModelTabBar'
import { AppTitleBar } from './components/AppTitleBar'
import { PreferencesModal } from './components/PreferencesModal'
import {
  AppToastStack,
  createToastId,
  pushAppToast,
  type AppToastItem,
  type FileSavedTitleKey,
} from './components/AppToastStack'
import { LoadingButton } from './components/LoadingButton'
import {
  UpdateAvailableDialog,
  type UpdateDialogPhase,
} from './components/UpdateAvailableDialog'
import { SceneSettingsPanels } from './components/SceneSettingsPanels'
import { DEFAULT_CAMERA, type CameraProjection } from './config/cameraDefaults'
import { ATLAS_MAX_EDGE_DEFAULT, clampAtlasMaxEdge, previewAtlasPack } from './lib/atlasLayout'
import {
  buildMultiAxisManifest,
  buildPitchLevelFromPreview,
  formatPitchForFilename,
  stemFromAtlasPath,
  type PitchLevelSheet,
} from './lib/multiAxisManifest'
import { captureFrameSequence } from './lib/recordCanvas'
import {
  getRecordingSizePreset,
  normalizeRecordingQuality,
  renderScaleForQuality,
  resolveRecordingCapturePlan,
  toEvenDimension,
  resolveRecordingOutputSize,
  needsExportMask,
} from './lib/recordingPresets'
import {
  cloneRecordingPreferences,
  patchPreferences,
  readPreferences,
  type RecordingPreferences,
} from './lib/preferences'
import {
  captureSessionFromTabs,
  readSession,
  writeSession,
} from './lib/sessionRestore'
import type {
  OpenedModel,
  RecordingMode,
  UpdatePromptEvent,
} from './desktopTypes'
import { MODEL_FILE_ACCEPT } from './lib/modelSource'
import { ModelResolveError, modelSourceFromFiles, modelSourceFromOpened } from './lib/resolveModelSource'
import {
  createEmptyTab,
  createInitialTabState,
  DEFAULT_SECONDS_PER_REV,
  recordingForTab,
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
  replaceTabModel,
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
import { cameraForRecording, withCameraProjection } from './lib/cameraFocus'
import logoUrl from './assets/logo.png'
import { Icon } from './icons'
import { useT } from './i18n'
import './styles.css'

export default function App() {
  const t = useT()
  const [tabState, setTabState] = useState<TabState>(createInitialTabState)
  const [dragOver, setDragOver] = useState(false)
  const [statusBarVisible, setStatusBarVisible] = useState(
    () => readPreferences().general.statusBarVisible
  )
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [updatePrompt, setUpdatePrompt] = useState<UpdatePromptEvent | null>(null)
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false)
  const [updatePromptBusy, setUpdatePromptBusy] = useState(false)
  const [updateDialogPhase, setUpdateDialogPhase] = useState<UpdateDialogPhase>('available')
  const [updateProgressPercent, setUpdateProgressPercent] = useState(0)
  const [updateErrorMessage, setUpdateErrorMessage] = useState('')
  const updateDialogPhaseRef = useRef<UpdateDialogPhase>('available')
  updateDialogPhaseRef.current = updateDialogPhase
  const [recordingEnabled, setRecordingEnabled] = useState(
    () => readPreferences().recording.enabled
  )
  const [recordingPrefs, setRecordingPrefs] = useState<RecordingPreferences>(
    () => cloneRecordingPreferences(readPreferences().recording)
  )
  const recordingPrefsRef = useRef(recordingPrefs)
  recordingPrefsRef.current = recordingPrefs
  const [performancePrefs, setPerformancePrefs] = useState(
    () => readPreferences().performance
  )
  const [appToasts, setAppToasts] = useState<AppToastItem[]>([])
  const [openingModel, setOpeningModel] = useState(false)
  const confirmCloseTabsRef = useRef(readPreferences().general.confirmCloseTabs)
  const sessionPersistReadyRef = useRef(false)
  const autoReloadRef = useRef(readPreferences().performance.autoReloadOnChange)
  autoReloadRef.current = performancePrefs.autoReloadOnChange

  const activeTab = getActiveTab(tabState)
  const {
    model,
    recording,
    exporting,
    exportPhase,
  } = activeTab

  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const captureHandleRefs = useRef<Record<string, { current: CaptureHandle | null }>>({})
  const abortRef = useRef({ aborted: false })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const tabStateRef = useRef(tabState)
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

  const dismissAppToast = useCallback((id: string) => {
    setAppToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const pushTextToast = useCallback(
    (tip: { severity: 'info' | 'error' | 'success'; message: string; durationMs?: number }) => {
      setAppToasts(prev =>
        pushAppToast(prev, {
          id: createToastId(),
          kind: 'text',
          severity: tip.severity,
          message: tip.message,
          durationMs: tip.durationMs ?? 4000,
        })
      )
    },
    []
  )

  const pushFileSavedToast = useCallback((path: string, titleKey: FileSavedTitleKey, durationMs = 4000) => {
    setAppToasts(prev =>
      pushAppToast(prev, {
        id: createToastId(),
        kind: 'fileSaved',
        path,
        titleKey,
        durationMs,
      })
    )
  }, [])

  useEffect(() => {
    return () => {
      revokeAllTabModels(tabStateRef.current.tabs)
    }
  }, [])

  useEffect(() => {
    if (!sessionPersistReadyRef.current) return
    writeSession(captureSessionFromTabs(tabState.tabs))
  }, [tabState.tabs])

  useEffect(() => {
    if (window.desktop) return
    sessionPersistReadyRef.current = true
  }, [])

  useEffect(() => {
    if (!window.desktop?.setRecentMax) return
    void window.desktop.setRecentMax(readPreferences().general.recentFilesMax)
  }, [])

  useEffect(() => {
    if (!window.desktop?.setCacheDir) return
    void window.desktop.setCacheDir(readPreferences().performance.cacheDir)
  }, [])

  useEffect(() => {
    if (!window.desktop?.setWatchedModelPaths) return
    if (!performancePrefs.autoReloadOnChange) {
      void window.desktop.setWatchedModelPaths([])
      return
    }
    const paths = tabState.tabs
      .map(tab => tab.model?.path)
      .filter((p): p is string => Boolean(p && canRevealModelPath(p)))
    void window.desktop.setWatchedModelPaths([...new Set(paths)])
  }, [tabState.tabs, performancePrefs.autoReloadOnChange])

  const confirmCloseTabsWithModels = useCallback(
    (tabs: ModelTab[]) => {
      if (!confirmCloseTabsRef.current) return true
      if (!tabs.some(tab => tab.model)) return true
      return window.confirm(t('prefs.confirmCloseTabs.message'))
    },
    [t]
  )

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
    if (recording || exporting || openingModel) return
    setOpeningModel(true)
    try {
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
    } finally {
      setOpeningModel(false)
    }
  }, [recording, exporting, openingModel, applyOpenedModel, patchActive, t])

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

  const reloadModelPath = useCallback(
    async (filePath: string) => {
      if (!window.desktop?.readModelPath || !autoReloadRef.current) return
      const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      const target = normalize(filePath)
      const tab = tabStateRef.current.tabs.find(
        candidate => candidate.model?.path && normalize(candidate.model.path) === target
      )
      if (!tab || tab.recording || tab.exporting) return
      try {
        const file = await window.desktop.readModelPath(filePath)
        const source = modelSourceFromOpened(file)
        setTabState(prev => replaceTabModel(prev, tab.id, source))
      } catch (err) {
        const message = err instanceof Error ? err.message : t('error.openFileFailed')
        setTabState(prev => patchTab(prev, tab.id, { error: message, loading: false }))
      }
    },
    [t]
  )

  useEffect(() => {
    if (!window.desktop?.onModelFileChanged) return
    return window.desktop.onModelFileChanged(filePath => {
      void reloadModelPath(filePath)
    })
  }, [reloadModelPath])

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
      const openPaths = async (paths: string[]) => {
        for (const filePath of paths) {
          if (cancelled) return
          const tab = getActiveTab(tabStateRef.current)
          if (tab.recording || tab.exporting) return
          try {
            const file = await window.desktop!.readModelPath(filePath)
            if (cancelled) return
            applyOpenedModel(file)
          } catch (err) {
            if (cancelled) return
            const message = err instanceof Error ? err.message : t('error.openFileFailed')
            setTabState(prev => openErrorInTabs(prev, message))
          }
        }
      }

      try {
        const pending =
          window.desktop?.takePendingOpenPaths != null
            ? await window.desktop.takePendingOpenPaths()
            : []
        if (cancelled) return
        if (pending.length > 0) {
          await openPaths(pending)
          return
        }

        const { startupBehavior } = readPreferences().general
        if (startupBehavior === 'blank') return

        if (startupBehavior === 'restoreSession') {
          const { modelPaths } = readSession()
          if (modelPaths.length > 0) await openPaths(modelPaths)
          return
        }

        if (startupBehavior === 'openRecent' && window.desktop?.getRecentPaths) {
          const recent = await window.desktop.getRecentPaths()
          if (cancelled || recent.length === 0) return
          await openPaths([recent[0]!])
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          sessionPersistReadyRef.current = true
          writeSession(captureSessionFromTabs(tabStateRef.current.tabs))
        }
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
    setStatusBarVisible(prev => {
      const next = !prev
      patchPreferences({ general: { statusBarVisible: next } })
      return next
    })
  }, [])

  useEffect(() => {
    if (!window.desktop?.onToggleStatusBar) return
    return window.desktop.onToggleStatusBar(toggleStatusBar)
  }, [toggleStatusBar])

  useEffect(() => {
    if (!window.desktop?.setAutoUpdateEnabled) return
    void (async () => {
      const chrome = await window.desktop?.getWindowChrome?.()
      if (chrome?.platform === 'darwin') return
      void window.desktop!.setAutoUpdateEnabled!(readPreferences().general.autoUpdate)
    })()
  }, [])

  useEffect(() => {
    if (!window.desktop?.onUpdatePrompt) return
    return window.desktop.onUpdatePrompt(prompt => {
      void (async () => {
        let phase: UpdateDialogPhase = 'available'
        let percent = 0
        let errorMessage = ''
        try {
          const status = await window.desktop?.getUpdateStatus?.()
          if (status?.phase === 'downloading') {
            phase = 'downloading'
            percent = status.percent
          } else if (status?.phase === 'ready') {
            phase = 'ready'
          } else if (status?.phase === 'error') {
            phase = 'error'
            errorMessage = status.message
          }
        } catch {
          /* keep available */
        }
        setUpdatePrompt(prompt)
        setUpdateDialogPhase(phase)
        setUpdateProgressPercent(percent)
        setUpdateErrorMessage(errorMessage)
        setUpdatePromptBusy(false)
        setUpdatePromptOpen(true)
      })()
    })
  }, [])

  useEffect(() => {
    if (!window.desktop?.onUpdateStatus) return
    return window.desktop.onUpdateStatus(status => {
      if (!updatePromptOpen) return
      if (status.phase === 'downloading') {
        setUpdateDialogPhase('downloading')
        setUpdateProgressPercent(status.percent)
      } else if (status.phase === 'ready') {
        setUpdateDialogPhase('ready')
        setUpdatePromptBusy(false)
      } else if (status.phase === 'error') {
        setUpdateDialogPhase('error')
        setUpdateErrorMessage(status.message)
        setUpdatePromptBusy(false)
      }
    })
  }, [updatePromptOpen])

  useEffect(() => {
    if (!window.desktop?.onUpdateProgress) return
    return window.desktop.onUpdateProgress(progress => {
      if (!updatePromptOpen) return
      setUpdateProgressPercent(progress.percent)
      setUpdateDialogPhase(prev => (prev === 'available' ? 'downloading' : prev))
    })
  }, [updatePromptOpen])

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
    const closing = tabStateRef.current.tabs.find(tab => tab.id === id)
    if (!closing) return
    if (closing.recording || closing.exporting) return
    if (!confirmCloseTabsWithModels([closing])) return
    setTabState(prev => {
      const group = getGroup(prev, groupId)
      const idx = group.tabIds.indexOf(id)
      const current = prev.tabs.find(tab => tab.id === id)
      if (idx < 0 || !current) return prev
      if (current.recording || current.exporting) return prev
      revokeTabModel(current)
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
  }, [confirmCloseTabsWithModels])

  const closeTabsByPredicate = useCallback((groupId: string, shouldClose: (tab: ModelTab, index: number) => boolean) => {
    const group = getGroup(tabStateRef.current, groupId)
    const groupTabs = getGroupTabs(tabStateRef.current, group.id)
    const candidates = groupTabs.filter((tab, index) => {
      if (tab.recording || tab.exporting) return false
      return shouldClose(tab, index)
    })
    if (candidates.length === 0) return
    if (!confirmCloseTabsWithModels(candidates)) return
    setTabState(prev => {
      const currentGroup = getGroup(prev, groupId)
      const currentGroupTabs = getGroupTabs(prev, currentGroup.id)
      const kept: ModelTab[] = []
      for (let i = 0; i < currentGroupTabs.length; i++) {
        const tab = currentGroupTabs[i]!
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
          tabs: prev.tabs.filter(tab => !currentGroup.tabIds.includes(tab.id)).concat(empty),
          groups: [{ ...currentGroup, tabIds: [empty.id], activeTabId: empty.id }],
        }
      }
      const keptIds = kept.map(tab => tab.id)
      const activeIndex = currentGroup.tabIds.indexOf(currentGroup.activeTabId)
      const nextGroup = {
        ...currentGroup,
        tabIds: keptIds,
        activeTabId: keptIds.includes(currentGroup.activeTabId)
          ? currentGroup.activeTabId
          : keptIds[Math.min(Math.max(activeIndex, 0), keptIds.length - 1)]!,
      }
      return unsplitIfNeeded({
        ...prev,
        tabs: prev.tabs.filter(tab => !currentGroup.tabIds.includes(tab.id) || keptIds.includes(tab.id)),
        groups: prev.groups.map(candidate => (candidate.id === currentGroup.id ? nextGroup : candidate)),
      })
    })
    canvasRefs.current[groupId] = null
  }, [confirmCloseTabsWithModels])

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

  const startRecording = async (groupId: string, mode?: RecordingMode) => {
    setTabState(prev => focusGroup(prev, groupId))
    const state = focusGroup(tabStateRef.current, groupId)
    const tab = getActiveTab(state, groupId)
    const recordingMode = mode ?? tab.recordingMode
    const patchRecordingTab = (patch: Partial<ModelTab>) => {
      setTabState(prev => patchTab(prev, tab.id, patch))
    }

    if (mode && mode !== tab.recordingMode) {
      patchRecordingTab({ recordingMode: mode })
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

    const rec = cloneRecordingPreferences(recordingPrefsRef.current)

    if (recordingMode === 'images' && !rec.exportSequence && !rec.exportAtlas) {
      patchRecordingTab({ error: t('record.imagesNeedOutput') })
      return
    }

    const stem = tab.model.label || 'model'
    const isImages = recordingMode === 'images'
    const exportMask =
      isImages &&
      needsExportMask({
        imageFormat: rec.imageFormat,
        exportBackground: rec.exportBackground,
        jpegNoBgMode: rec.jpegNoBgMode,
      })
    const multiAxis = isImages && rec.multiAxisEnabled
    const pitchAngles = multiAxis
      ? rec.pitchAngles.length > 0
        ? rec.pitchAngles
        : [-15, 0, 25, 50, 75]
      : [0]
    if (multiAxis && pitchAngles.length === 0) {
      patchRecordingTab({ error: t('record.pitchAngles.invalid') })
      return
    }

    const quality = normalizeRecordingQuality(
      isImages ? rec.imageCaptureQuality : rec.videoQuality
    )
    const sizeId = isImages ? rec.imageSizeId : rec.videoSizeId
    const { totalFrames, encodeFps } = resolveRecordingCapturePlan({
      mode: recordingMode,
      frameCount: rec.frameCount,
      secondsPerRevolution: rec.secondsPerRevolution,
      recordingFps: rec.recordingFps,
    })
    const fps = encodeFps
    const sizePreset = getRecordingSizePreset(sizeId)
    const customSize = isImages
      ? { width: rec.imageCustomWidth, height: rec.imageCustomHeight }
      : { width: rec.videoCustomWidth, height: rec.videoCustomHeight }
    const outputSize = resolveRecordingOutputSize(canvas, sizePreset, customSize)
    const atlasMaxEdge = clampAtlasMaxEdge(rec.atlasMaxEdge, ATLAS_MAX_EDGE_DEFAULT)
    const requestedScale =
      sizePreset.width != null && sizePreset.width >= 3840 && quality !== 'standard'
        ? 1
        : sizeId === 'custom' && outputSize.width >= 3840 && quality !== 'standard'
          ? 1
          : renderScaleForQuality(quality)
    let plannedCapture = captureHandle.planCapture(outputSize, requestedScale)

    const runPreflight = async (): Promise<void> => {
      const rotations = [0, Math.PI / 6]
      for (const rotationY of rotations) {
        await captureHandle.captureFrame(rotationY, plannedCapture.outputSize, plannedCapture.renderScale)
        if (exportMask && captureHandle.captureMaskFrame) {
          await captureHandle.captureMaskFrame(
            rotationY,
            plannedCapture.outputSize,
            plannedCapture.renderScale
          )
        }
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
      patchRecordingTab({
        error: plannedCapture.reason ?? t('error.recordingAutoAdjusted'),
      })
    }

    const waitForCameraApply = () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.setTimeout(resolve, 50)
          })
        })
      })

    const baseName = `${stem}-turntable_${sizeId}_${quality}`
    let outputDir = isImages ? rec.imageOutputDir : rec.videoOutputDir
    let batchStem = baseName
    const savedCamera = { ...tab.camera }
    const captureCamera = cameraForRecording(savedCamera, rec.recordProjection)
    const overrideProjection = captureCamera.projection !== savedCamera.projection
    const pitchLevels: PitchLevelSheet[] = []
    let lastSavedPath = ''
    let allocatedBaseStem = baseName

    if (multiAxis && isImages && !outputDir.trim()) {
      const picked = await window.desktop.pickImagesOutputBase({ defaultName: baseName })
      if (!picked) return
      outputDir = picked.dir
      batchStem = picked.stem
      allocatedBaseStem = picked.stem
    }

    const abort = { aborted: false }
    abortRef.current = abort

    const pitchesToRun = multiAxis ? pitchAngles : [null as number | null]
    const totalCaptureFrames = totalFrames * pitchesToRun.length

    if (overrideProjection) {
      // Swap while recording is still false so CameraRig applies the pose.
      patchRecordingTab({ camera: captureCamera })
      await waitForCameraApply()
    }

    patchRecordingTab({
      recording: true,
      recordingJob: rec,
      progressRad: 0,
      exportPhase: { kind: 'capturing', done: 0, total: totalCaptureFrames },
    })

    // CaptureBridge's useLayoutEffect replaces captureRef.current with a brand-new
    // object whenever capture-affecting props (e.g. captureNeedsAlpha) change. The
    // `captureHandle` snapshot taken above (before recording:true) can go stale —
    // always re-read the live handle before using it so the alpha-aware
    // captureFrame closure is used.
    let liveCaptureHandle = captureHandle

    try {
      // Wait for ViewerScene to apply noExportBackground + refresh CaptureBridge (useLayoutEffect).
      await waitForCameraApply()
      liveCaptureHandle = captureHandleRefs.current[groupId]?.current ?? liveCaptureHandle

      let globalDone = 0

      for (let pitchIndex = 0; pitchIndex < pitchesToRun.length; pitchIndex++) {
        if (abort.aborted) throw new Error(t('error.noFrames'))

        const pitch = pitchesToRun[pitchIndex]
        if (multiAxis && pitch != null) {
          // Bypass panel sync freeze during recording — write elevation to live camera.
          liveCaptureHandle.setOrbitElevationDegrees(pitch, captureCamera)
          await waitForCameraApply()
          liveCaptureHandle = captureHandleRefs.current[groupId]?.current ?? liveCaptureHandle
        }

        const defaultName =
          multiAxis && pitch != null
            ? `${batchStem}_pitch${formatPitchForFilename(pitch)}`
            : baseName

        const sessionRes = await window.desktop.startRecordingSession({
          defaultName,
          format: isImages ? 'images' : rec.videoExportFormat,
          quality,
          fps,
          images: isImages
            ? {
                exportSequence: rec.exportSequence,
                exportAtlas: rec.exportAtlas,
                exportBackground: rec.exportBackground,
                jpegNoBgMode: rec.jpegNoBgMode,
                imageFlattenColor: rec.imageFlattenColor,
                imageFormat: rec.imageFormat,
                imageQuality: rec.imageQuality,
                sequencePackage: rec.sequencePackage,
                atlasPackMode: rec.atlasPackMode,
                atlasMaxEdge,
              }
            : undefined,
        })
        if (!sessionRes.ok) {
          patchRecordingTab({ error: sessionRes.reason })
          return
        }

        const frameCount = await captureFrameSequence({
          captureHandle: liveCaptureHandle,
          totalFrames,
          outputSize: plannedCapture.outputSize,
          renderScale: plannedCapture.renderScale,
          signal: abort,
          exportMask,
          fps,
          onFrame: (index, pngData, maskData) =>
            window.desktop!.appendRecordingFrame({
              sessionId: sessionRes.sessionId,
              index,
              data: pngData,
              maskData,
            }),
          onProgress: done => {
            const overall = globalDone + done
            setTabState(prev =>
              patchTab(prev, tab.id, {
                progressRad: (overall / totalCaptureFrames) * Math.PI * 2,
                exportPhase: { kind: 'capturing', done: overall, total: totalCaptureFrames },
              })
            )
          },
        })

        if (abort.aborted || frameCount <= 0) {
          throw new Error(t('error.noFrames'))
        }

        globalDone += frameCount

        patchRecordingTab({
          recording: false,
          exporting: true,
          exportPhase: { kind: 'encoding', stage: t('error.encodingStarting'), percent: 0 },
        })

        const result = await window.desktop.finishRecordingSession({
          sessionId: sessionRes.sessionId,
          frameCount,
          fps,
          outputDir,
        })

        if (!result.ok) {
          if (result.reason !== 'canceled') {
            patchRecordingTab({ error: result.reason || t('error.saveRecording') })
          }
          return
        }

        lastSavedPath = result.path
        if (multiAxis && pitch != null && rec.exportAtlas) {
          const atlasPath =
            result.paths.find(p => /_atlas_\d+\.(png|jpe?g|webp)$/i.test(p)) ?? result.path
          const allocatedStem = stemFromAtlasPath(atlasPath) ?? defaultName
          const pitchTag = `_pitch${formatPitchForFilename(pitch)}`
          if (allocatedStem.endsWith(pitchTag)) {
            allocatedBaseStem = allocatedStem.slice(0, -pitchTag.length)
          }
          const packPreview = previewAtlasPack({
            tileW: plannedCapture.outputSize.width,
            tileH: plannedCapture.outputSize.height,
            frameCount: totalFrames,
            packMode: rec.atlasPackMode,
            maxEdge: atlasMaxEdge,
          })
          pitchLevels.push(
            buildPitchLevelFromPreview(
              pitch,
              allocatedStem,
              rec.imageFormat,
              packPreview,
              totalFrames
            )
          )
        }

        if (pitchIndex < pitchesToRun.length - 1) {
          patchRecordingTab({
            recording: true,
            exporting: false,
            exportPhase: {
              kind: 'capturing',
              done: globalDone,
              total: totalCaptureFrames,
            },
          })
        }
      }

      if (multiAxis && rec.exportAtlas && pitchLevels.length > 0) {
        const manifest = buildMultiAxisManifest({
          baseStem: allocatedBaseStem,
          pitchAngles,
          levels: pitchLevels,
          yawColumns: totalFrames,
          sourceWidth: plannedCapture.outputSize.width,
          sourceHeight: plannedCapture.outputSize.height,
          imageFormat: rec.imageFormat,
          atlasMaxEdge,
        })
        const manifestDir =
          outputDir.trim() ||
          (lastSavedPath.includes('/') || lastSavedPath.includes('\\')
            ? lastSavedPath.replace(/[/\\][^/\\]+$/, '')
            : '')
        if (manifestDir && window.desktop.writeRecordingManifest) {
          const manifestRes = await window.desktop.writeRecordingManifest({
            outputDir: manifestDir,
            fileName: `${allocatedBaseStem}_multiaxis.json`,
            json: JSON.stringify(manifest, null, 2),
          })
          if (manifestRes.ok) {
            lastSavedPath = manifestRes.path
          }
        }
      }

      if (lastSavedPath) {
        pushFileSavedToast(lastSavedPath, 'record.savedTitle', 12000)
      }
    } catch (err) {
      patchRecordingTab({ error: err instanceof Error ? err.message : t('error.recordingFailed') })
    } finally {
      if (multiAxis && !overrideProjection) {
        liveCaptureHandle.applyCameraPose(savedCamera)
      }
      patchRecordingTab({
        recording: false,
        exporting: false,
        recordingJob: null,
        exportPhase: { kind: 'idle' },
        progressRad: 0,
        camera: savedCamera,
      })
    }
  }

  const stopRecording = () => {
    if (!recording || exporting) return
    if (!window.confirm(t('record.stopConfirm'))) return
    abortRef.current.aborted = true
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

  const sessionLocked = tabState.tabs.some(tab => tab.recording || tab.exporting)
  const pickerDisabled = sessionLocked

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
    <LoadingButton
      variant="contained"
      color="primary"
      className="model-pick-btn"
      disabled={pickerDisabled}
      loading={openingModel}
      loadingText={t('app.openingFile')}
      onClick={() => void handleOpenModel()}
    >
      {t('app.openFile')}
    </LoadingButton>
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
            const rec = recordingForTab(groupTab, recordingPrefs)
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
                    <Alert
                      severity="error"
                      className="viewport-error-banner"
                      onClose={() =>
                        setTabState(prev => patchTab(prev, groupTab.id, { error: null }))
                      }
                    >
                      <span className="viewport-error-banner-text">{groupTab.error}</span>
                    </Alert>
                  ) : null}
                  {groupTab.model ? (
                    <>
                      <ViewerScene
                        key={`${group.id}-${groupTab.id}`}
                        model={groupTab.model}
                        cameraSettings={groupTab.camera}
                        lightingSettings={groupTab.lighting}
                        shadingMode={groupTab.shadingMode}
                          recordingMode={groupTab.recordingMode}
                        recording={groupTab.recording || groupTab.exporting}
                          exportBackground={rec.exportBackground}
                          imageFormat={rec.imageFormat}
                          exportMask={
                            groupTab.recordingMode === 'images' &&
                            needsExportMask({
                              imageFormat: rec.imageFormat,
                              exportBackground: rec.exportBackground,
                              jpegNoBgMode: rec.jpegNoBgMode,
                            })
                          }
                          exportFlattenColor={
                            groupTab.recordingMode === 'video'
                              ? rec.videoFlattenColor
                              : rec.imageFlattenColor
                          }
                        secondsPerRevolution={rec.secondsPerRevolution}
                        msaa={performancePrefs.msaa}
                        maxTextureSize={performancePrefs.maxTextureSize}
                        autoNormalizeUnits={performancePrefs.autoNormalizeUnits !== false}
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
                        onCameraSettingsChange={next =>
                          setTabState(prev => patchTab(prev, groupTab.id, { camera: next }))
                        }
                        onToast={pushTextToast}
                        onFileSavedToast={path => pushFileSavedToast(path, 'decimate.exportSavedTitle')}
                        captureRef={getCaptureRef(group.id)}
                        showInfoHud={statusBarVisible}
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
                          setTabState(prev => {
                            const tab = prev.tabs.find(item => item.id === groupTab.id)
                            if (!tab) return prev
                            const camera =
                              key === 'projection'
                                ? withCameraProjection(tab.camera, value as CameraProjection)
                                : { ...tab.camera, [key]: value }
                            return patchTab(prev, groupTab.id, { camera })
                          })
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
                      {groupTab.recording ? (
                        <Chip label="REC" color="error" size="small" className="rec-badge" />
                      ) : null}
                      {recordingEnabled ? (
                        <div className="record-fab-wrap">
                          <IconButton
                            className={`record-fab record-fab--${groupTab.recordingMode}`}
                            disabled={groupLocked || groupTab.loading}
                            aria-label={
                              groupTab.recordingMode === 'video'
                                ? t('record.start.video')
                                : t('record.start.images')
                            }
                            title={
                              groupTab.recordingMode === 'video'
                                ? t('record.start.video')
                                : t('record.start.images')
                            }
                            onClick={() => {
                              setTabState(prev => focusGroup(prev, group.id))
                              void startRecording(group.id)
                            }}
                          >
                            <span className="record-fab-inner" aria-hidden>
                              <Icon
                                icon={
                                  groupTab.recordingMode === 'video'
                                    ? 'material-symbols:videocam'
                                    : 'material-symbols:photo-camera'
                                }
                                aria-hidden
                              />
                            </span>
                          </IconButton>
                          <IconButton
                            className={`record-fab-mode record-fab-mode--${groupTab.recordingMode}`}
                            disabled={groupLocked || groupTab.loading}
                            aria-label={
                              groupTab.recordingMode === 'video'
                                ? t('record.switchTo.images')
                                : t('record.switchTo.video')
                            }
                            title={
                              groupTab.recordingMode === 'video'
                                ? t('record.switchTo.images')
                                : t('record.switchTo.video')
                            }
                            onClick={() => {
                              setTabState(prev => {
                                const focused = focusGroup(prev, group.id)
                                const tab = getActiveTab(focused, group.id)
                                const nextMode =
                                  tab.recordingMode === 'video' ? 'images' : 'video'
                                return patchTab(focused, tab.id, { recordingMode: nextMode })
                              })
                            }}
                          >
                            <Icon
                              icon={
                                groupTab.recordingMode === 'video'
                                  ? 'material-symbols:photo-camera'
                                  : 'material-symbols:videocam'
                              }
                              aria-hidden
                            />
                          </IconButton>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="empty flex flex-col items-center justify-center gap-3">
                      <div className="empty-brand flex flex-col items-center">
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
        <AppToastStack
          toasts={appToasts}
          onDismiss={dismissAppToast}
          onOpenFileFailed={reason =>
            pushTextToast({
              severity: 'error',
              message: t('record.openFailed', { reason }),
              durationMs: 6000,
            })
          }
        />
        <UpdateAvailableDialog
          open={updatePromptOpen}
          prompt={updatePrompt}
          phase={updateDialogPhase}
          progressPercent={updateProgressPercent}
          errorMessage={updateErrorMessage}
          busy={updatePromptBusy}
          onLater={() => {
            const phase = updateDialogPhaseRef.current
            setUpdatePromptOpen(false)
            setUpdatePromptBusy(false)
            if (phase === 'available') {
              void window.desktop?.dismissUpdate?.()
            }
          }}
          onUpdateNow={() => {
            if (updatePrompt?.releaseUrl) {
              void window.desktop?.openExternalUrl?.(updatePrompt.releaseUrl)
              return
            }
            setUpdatePromptBusy(true)
            setUpdateDialogPhase('downloading')
            setUpdateProgressPercent(0)
            setUpdateErrorMessage('')
            void (async () => {
              const ok = await window.desktop?.downloadUpdate?.()
              setUpdatePromptBusy(false)
              if (ok === false) {
                setUpdateDialogPhase('error')
                setUpdateErrorMessage('')
              }
            })()
          }}
          onRestart={() => {
            setUpdatePromptBusy(true)
            void window.desktop?.installUpdate?.()
          }}
        />
      </main>

      <PreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        onUpdateCheckTip={tip =>
          pushTextToast({
            severity: tip.severity,
            message: tip.message,
            durationMs: 4000,
          })
        }
        onPreferencesChange={prefs => {
          setRecordingEnabled(prefs.recording.enabled)
          setRecordingPrefs(cloneRecordingPreferences(prefs.recording))
          setStatusBarVisible(prefs.general.statusBarVisible)
          confirmCloseTabsRef.current = prefs.general.confirmCloseTabs
          setPerformancePrefs(prefs.performance)
        }}
      />
    </div>
  )
}
