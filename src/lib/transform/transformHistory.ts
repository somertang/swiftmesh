import { Matrix4, Vector3, type Object3D } from 'three'
import type { TransformHistoryEntry, TransformSnapshot } from './transformTypes'
import { applyTransform, captureTransform, transformsEqual } from './transformMath'

const _m = new Matrix4()

export function setWorldPosition(object: Object3D, worldPos: Vector3) {
  object.updateMatrixWorld(true)
  const parent = object.parent
  if (parent) {
    _m.copy(parent.matrixWorld).invert()
    object.position.copy(worldPos).applyMatrix4(_m)
  } else {
    object.position.copy(worldPos)
  }
  object.updateMatrixWorld(true)
}

export function applyWorldTranslationDelta(object: Object3D, worldDelta: Vector3) {
  const worldPos = object.getWorldPosition(new Vector3()).add(worldDelta)
  setWorldPosition(object, worldPos)
}

export class TransformHistory {
  private undoStack: TransformHistoryEntry[] = []
  private redoStack: TransformHistoryEntry[] = []
  private readonly maxEntries: number

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries
  }

  clear() {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }

  push(entry: TransformHistoryEntry) {
    if (transformsEqual(entry.before, entry.after)) return
    this.undoStack.push(entry)
    if (this.undoStack.length > this.maxEntries) this.undoStack.shift()
    this.redoStack.length = 0
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  undo(resolve: (hierId: string) => Object3D | null): TransformSnapshot | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    const object = resolve(entry.hierId)
    if (object) applyTransform(object, entry.before)
    this.redoStack.push(entry)
    return entry.before
  }

  redo(resolve: (hierId: string) => Object3D | null): TransformSnapshot | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    const object = resolve(entry.hierId)
    if (object) applyTransform(object, entry.after)
    this.undoStack.push(entry)
    return entry.after
  }

  /** Convenience: record a completed drag. */
  commit(hierId: string, before: TransformSnapshot, object: Object3D) {
    this.push({ hierId, before, after: captureTransform(object) })
  }
}
