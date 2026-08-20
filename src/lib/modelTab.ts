import { DEFAULT_CAMERA, type CameraSettings } from '../config/cameraDefaults'
import type { LightingSettings } from '../config/lightingDefaults'
import type { ExportPhase } from '../components/ExportProgressModal'
import type { ModelPermissions, RecordingMode } from '../desktopTypes'
import { basenameOf, revokeModelSource, type ModelSource } from './modelSource'
import {
  DEFAULT_RECORDING_PREFERENCES,
  readPreferences,
  type AppPreferences,
  type RecordingPreferences,
} from './preferences'
import { DEFAULT_SHADING_MODE, type ShadingMode } from './shadingMode'

export const DEFAULT_SECONDS_PER_REV = DEFAULT_RECORDING_PREFERENCES.secondsPerRevolution

export function recordingForTab(
  tab: Pick<ModelTab, 'recordingJob'>,
  live: RecordingPreferences
): RecordingPreferences {
  return tab.recordingJob ?? live
}

export type ModelTab = {
  id: string
  model: ModelSource | null
  camera: CameraSettings
  lighting: LightingSettings
  shadingMode: ShadingMode
  recordingMode: RecordingMode
  /** Frozen recording prefs for an in-progress capture/export; otherwise live preferences apply. */
  recordingJob: RecordingPreferences | null
  loading: boolean
  recording: boolean
  exporting: boolean
  exportPhase: ExportPhase
  progressRad: number
  error: string | null
  /** Permissions from an unlocked .smsh container; absent for plain models. */
  permissions?: ModelPermissions
}

export type TabState = {
  tabs: ModelTab[]
  groups: EditorGroup[]
  focusedGroupId: string
  splitDirection: 'right' | 'down' | null
  splitRatio: number
}

export type EditorGroup = {
  id: string
  tabIds: string[]
  activeTabId: string
}

function isAbsoluteModelPath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\')
}

/** True when the path can be revealed in the OS file manager. */
export function canRevealModelPath(filePath: string | null | undefined): filePath is string {
  const raw = filePath?.trim()
  return Boolean(raw && isAbsoluteModelPath(raw))
}

function normalizeIdentityPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Identity key for duplicate-tab detection: absolute path, else basename. */
export function modelIdentityKey(model: Pick<ModelSource, 'path'> | { path: string | null }): string | null {
  const raw = model.path?.trim()
  if (!raw) return null
  if (isAbsoluteModelPath(raw)) {
    return `path:${normalizeIdentityPath(raw)}`
  }
  return `name:${basenameOf(raw).toLowerCase()}`
}

export function findTabWithModel(state: TabState, source: Pick<ModelSource, 'path'>): ModelTab | null {
  const key = modelIdentityKey(source)
  if (!key) return null
  return (
    state.tabs.find(tab => {
      if (!tab.model) return false
      return modelIdentityKey(tab.model) === key
    }) ?? null
  )
}

export function createEmptyTab(prefs?: AppPreferences): ModelTab {
  const defaults = prefs ?? (typeof window !== 'undefined' ? readPreferences() : null)
  const recording = defaults?.recording ?? DEFAULT_RECORDING_PREFERENCES
  const lighting = defaults?.lighting
  return {
    id: crypto.randomUUID(),
    model: null,
    camera: { ...DEFAULT_CAMERA },
    lighting: lighting
      ? { ...lighting }
      : { mode: 'studio', exposure: 1, envIntensity: 1 },
    shadingMode: DEFAULT_SHADING_MODE,
    recordingMode: recording.recordingMode,
    recordingJob: null,
    loading: false,
    recording: false,
    exporting: false,
    exportPhase: { kind: 'idle' },
    progressRad: 0,
    error: null,
  }
}

export function createInitialTabState(): TabState {
  const tab = createEmptyTab()
  const groupId = crypto.randomUUID()
  return {
    tabs: [tab],
    groups: [{ id: groupId, tabIds: [tab.id], activeTabId: tab.id }],
    focusedGroupId: groupId,
    splitDirection: null,
    splitRatio: 0.5,
  }
}

export function getGroup(state: TabState, groupId: string): EditorGroup {
  return state.groups.find(group => group.id === groupId) ?? state.groups[0]!
}

export function getFocusedGroup(state: TabState): EditorGroup {
  return getGroup(state, state.focusedGroupId)
}

export function getGroupTabs(state: TabState, groupId: string): ModelTab[] {
  const group = getGroup(state, groupId)
  return group.tabIds
    .map(id => state.tabs.find(tab => tab.id === id))
    .filter((tab): tab is ModelTab => Boolean(tab))
}

export function getActiveTab(state: TabState, groupId = state.focusedGroupId): ModelTab {
  const group = getGroup(state, groupId)
  return state.tabs.find(tab => tab.id === group.activeTabId) ?? getGroupTabs(state, group.id)[0]!
}

export function findTabGroup(state: TabState, tabId: string): EditorGroup | null {
  return state.groups.find(group => group.tabIds.includes(tabId)) ?? null
}

export function tabTitle(tab: ModelTab, emptyLabel = 'New tab'): string {
  return tab.model?.label || emptyLabel
}

export function revokeTabModel(tab: ModelTab) {
  revokeModelSource(tab.model)
}

export function revokeAllTabModels(tabs: ModelTab[]) {
  for (const tab of tabs) {
    revokeModelSource(tab.model)
  }
}

export function patchTab(state: TabState, tabId: string, patch: Partial<ModelTab>): TabState {
  return {
    ...state,
    tabs: state.tabs.map(t => (t.id === tabId ? { ...t, ...patch } : t)),
  }
}

/** Reload a model into an existing tab (revokes the previous source). */
export function replaceTabModel(
  state: TabState,
  tabId: string,
  source: ModelSource,
  permissions?: ModelPermissions
): TabState {
  const tab = state.tabs.find(candidate => candidate.id === tabId)
  if (!tab || tab.recording || tab.exporting) {
    revokeModelSource(source)
    return state
  }
  revokeTabModel(tab)
  return patchTab(state, tabId, {
    model: source,
    permissions,
    error: null,
    loading: true,
  })
}

export function patchActiveTab(state: TabState, patch: Partial<ModelTab>): TabState {
  return patchTab(state, getActiveTab(state).id, patch)
}

/**
 * Move a tab so it ends up at `toIndex` in the resulting array.
 * No-op when the id is missing or the order would not change.
 */
export function reorderTabs(state: TabState, fromId: string, toIndex: number): TabState {
  const group = getFocusedGroup(state)
  const from = group.tabIds.indexOf(fromId)
  if (from < 0) return state
  const clamped = Math.max(0, Math.min(toIndex, group.tabIds.length - 1))
  if (from === clamped) return state
  const tabIds = [...group.tabIds]
  const [item] = tabIds.splice(from, 1)
  tabIds.splice(clamped, 0, item!)
  return {
    ...state,
    groups: state.groups.map(candidate => (candidate.id === group.id ? { ...candidate, tabIds } : candidate)),
  }
}

export function updateActiveTab(
  state: TabState,
  updater: (tab: ModelTab) => ModelTab
): TabState {
  return {
    ...state,
    tabs: state.tabs.map(t => (t.id === getActiveTab(state).id ? updater(t) : t)),
  }
}

export function focusGroup(state: TabState, groupId: string): TabState {
  if (!state.groups.some(group => group.id === groupId) || state.focusedGroupId === groupId) return state
  return { ...state, focusedGroupId: groupId }
}

export function selectTabInGroup(state: TabState, groupId: string, tabId: string): TabState {
  const group = getGroup(state, groupId)
  if (!group.tabIds.includes(tabId)) return state
  return {
    ...state,
    focusedGroupId: group.id,
    groups: state.groups.map(candidate =>
      candidate.id === group.id ? { ...candidate, activeTabId: tabId } : candidate
    ),
  }
}

export function addTabToFocusedGroup(state: TabState): TabState {
  const tab = createEmptyTab()
  const group = getFocusedGroup(state)
  return {
    ...state,
    tabs: [...state.tabs, tab],
    groups: state.groups.map(candidate =>
      candidate.id === group.id
        ? { ...candidate, tabIds: [...candidate.tabIds, tab.id], activeTabId: tab.id }
        : candidate
    ),
  }
}

export function splitEditor(state: TabState, direction: 'right' | 'down'): TabState {
  if (state.groups.length >= 2) return state
  const source = getFocusedGroup(state)
  const movedTabId = source.activeTabId
  const newGroupId = crypto.randomUUID()
  const sourceTabIds = source.tabIds.filter(id => id !== movedTabId)
  let tabs = state.tabs
  if (sourceTabIds.length === 0) {
    const empty = createEmptyTab()
    tabs = [...tabs, empty]
    sourceTabIds.push(empty.id)
  }
  const sourceActiveTabId = sourceTabIds.includes(source.activeTabId)
    ? source.activeTabId
    : sourceTabIds[0]!
  return {
    ...state,
    tabs,
    groups: [
      { ...source, tabIds: sourceTabIds, activeTabId: sourceActiveTabId },
      { id: newGroupId, tabIds: [movedTabId], activeTabId: movedTabId },
    ],
    focusedGroupId: newGroupId,
    splitDirection: direction,
  }
}

export function moveTabToGroup(
  state: TabState,
  tabId: string,
  targetGroupId: string,
  toIndex?: number
): TabState {
  const source = findTabGroup(state, tabId)
  const target = getGroup(state, targetGroupId)
  if (!source || source.id === target.id || state.groups.length < 2) return state
  if (target.tabIds.includes(tabId)) return state

  const sourceTabIds = source.tabIds.filter(id => id !== tabId)
  const insertAt = Math.max(0, Math.min(toIndex ?? target.tabIds.length, target.tabIds.length))
  const targetTabIds = [...target.tabIds]
  targetTabIds.splice(insertAt, 0, tabId)

  const next: TabState = {
    ...state,
    groups: state.groups.map(group => {
      if (group.id === source.id) {
        return {
          ...group,
          tabIds: sourceTabIds,
          activeTabId: sourceTabIds.includes(group.activeTabId)
            ? group.activeTabId
            : (sourceTabIds[0] ?? ''),
        }
      }
      if (group.id === target.id) {
        return { ...group, tabIds: targetTabIds, activeTabId: tabId }
      }
      return group
    }),
    focusedGroupId: target.id,
  }
  return unsplitIfNeeded(next)
}

export function unsplitIfNeeded(state: TabState): TabState {
  const nonEmptyGroups = state.groups.filter(group => group.tabIds.length > 0)
  if (nonEmptyGroups.length === state.groups.length) return state
  if (nonEmptyGroups.length === 0) {
    const empty = createEmptyTab()
    const id = crypto.randomUUID()
    return {
      ...state,
      tabs: [...state.tabs, empty],
      groups: [{ id, tabIds: [empty.id], activeTabId: empty.id }],
      focusedGroupId: id,
      splitDirection: null,
    }
  }
  const group = nonEmptyGroups[0]!
  return {
    ...state,
    groups: [group],
    focusedGroupId: group.id,
    splitDirection: null,
  }
}

/**
 * Put a model into the active empty tab, or create a new tab when the active tab already has a model.
 * If the same file is already open, activate that tab instead (does not reload / reset settings).
 * Never replaces an existing model in-place.
 */
export function openModelInTabs(
  state: TabState,
  source: ModelSource,
  permissions?: ModelPermissions
): TabState {
  const active = getActiveTab(state)
  if (active.recording || active.exporting) {
    revokeModelSource(source)
    return state
  }

  const existing = findTabWithModel(state, source)
  if (existing) {
    revokeModelSource(source)
    const group = findTabGroup(state, existing.id)
    return group ? selectTabInGroup(state, group.id, existing.id) : state
  }

  if (!active.model) {
    return updateActiveTab(state, tab => ({
      ...tab,
      model: source,
      permissions,
      error: null,
      progressRad: 0,
      loading: false,
    }))
  }

  const tab = createEmptyTab()
  const group = getFocusedGroup(state)
  return {
    ...state,
    tabs: [
      ...state.tabs,
      { ...tab, model: source, permissions, error: null, progressRad: 0, loading: false },
    ],
    groups: state.groups.map(candidate =>
      candidate.id === group.id
        ? { ...candidate, tabIds: [...candidate.tabIds, tab.id], activeTabId: tab.id }
        : candidate
    ),
  }
}

/** Surface a resolve error on the active empty tab, or on a newly created tab if active already has a model. */
export function openErrorInTabs(state: TabState, message: string): TabState {
  const active = getActiveTab(state)
  if (active.recording || active.exporting) return state

  if (!active.model) {
    return patchActiveTab(state, { error: message })
  }

  const tab = createEmptyTab()
  const group = getFocusedGroup(state)
  return {
    ...state,
    tabs: [...state.tabs, { ...tab, error: message }],
    groups: state.groups.map(candidate =>
      candidate.id === group.id
        ? { ...candidate, tabIds: [...candidate.tabIds, tab.id], activeTabId: tab.id }
        : candidate
    ),
  }
}
