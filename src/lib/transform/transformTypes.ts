export type TransformMode = 'translate' | 'rotate' | 'scale'

/** Viewport tools that show an object transform gizmo. */
export type TransformToolId = 'select' | TransformMode

export type TransformSpace = 'global' | 'local'

export type TransformAxis = 'x' | 'y' | 'z' | 'view' | 'trackball' | 'xy' | 'yz' | 'xz' | 'xyz'

export type TransformSnapshot = {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  scale: [number, number, number]
}

export type TransformHistoryEntry = {
  hierId: string
  before: TransformSnapshot
  after: TransformSnapshot
}
