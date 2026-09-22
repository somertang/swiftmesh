import { Box3, type Object3D } from 'three'
import { isMeshObject } from './isMeshObject'

export type HierarchyNode = {
  id: string
  name: string
  type: string
  kind: 'mesh' | 'group' | 'object'
  childCount: number
  visible: boolean
  children: HierarchyNode[]
}

export type HierarchyClipboardNode = {
  name: string
  children?: HierarchyClipboardNode[]
}

/** Name-only tree for clipboard. Skips the synthetic Scene root. Leaf nodes omit `children`. */
export function hierarchyClipboardTree(root: HierarchyNode): HierarchyClipboardNode | null {
  const source = root.id === 'scene-root' ? root.children[0] : root
  if (!source) return null
  return toClipboardNode(source)
}

function toClipboardNode(node: HierarchyNode): HierarchyClipboardNode {
  const out: HierarchyClipboardNode = { name: node.name }
  if (node.children.length > 0) {
    out.children = node.children.map(toClipboardNode)
  }
  return out
}

export type HierarchyBuildResult = {
  root: HierarchyNode
  objects: Map<string, Object3D>
  /** Ancestor ids from scene-root → node (inclusive), for expand-to-selection. */
  paths: Map<string, string[]>
}

export const FIT_WORLD_BOX_KEY = '__fitWorldBox'

function nodeKind(object: Object3D): HierarchyNode['kind'] {
  if (isMeshObject(object)) return 'mesh'
  if (object.children.length > 0) return 'group'
  return 'object'
}

function displayName(object: Object3D) {
  const name = object.name?.trim()
  if (name) return name
  return object.type || 'Object'
}

/** World-space AABB cached on `object.userData.__fitWorldBox` for fast camera framing. */
function cacheFitWorldBox(object: Object3D): Box3 {
  const box = new Box3()
  if (isMeshObject(object) && object.geometry) {
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    const local = object.geometry.boundingBox
    if (local && !local.isEmpty()) {
      box.copy(local).applyMatrix4(object.matrixWorld)
      object.userData[FIT_WORLD_BOX_KEY] = box.clone()
      return box
    }
  }

  for (const child of object.children) {
    if (child.userData.__hierarchyIgnore) continue
    const childBox = cacheFitWorldBox(child)
    if (!childBox.isEmpty()) box.union(childBox)
  }

  if (!box.isEmpty()) object.userData[FIT_WORLD_BOX_KEY] = box.clone()
  else delete object.userData[FIT_WORLD_BOX_KEY]
  return box
}

/** Walk a loaded model root and build a UI tree + id→Object3D map. */
export function buildSceneHierarchy(rootObject: Object3D): HierarchyBuildResult {
  const objects = new Map<string, Object3D>()
  const paths = new Map<string, string[]>()
  let nextId = 0

  rootObject.updateWorldMatrix(true, true)

  const walk = (object: Object3D, ancestors: string[]): HierarchyNode => {
    const id = `h${nextId++}`
    object.userData.__hierId = id
    objects.set(id, object)
    const path = [...ancestors, id]
    paths.set(id, path)

    const children = object.children
      .filter(child => !child.userData.__hierarchyIgnore)
      .map(child => walk(child, path))

    return {
      id,
      name: displayName(object),
      type: object.type,
      kind: nodeKind(object),
      childCount: children.length,
      visible: object.visible,
      children,
    }
  }

  const modelTree = walk(rootObject, ['scene-root'])
  const root: HierarchyNode = {
    id: 'scene-root',
    name: 'Scene',
    type: 'Scene',
    kind: 'group',
    childCount: 1,
    visible: true,
    children: [modelTree],
  }
  paths.set('scene-root', ['scene-root'])

  cacheFitWorldBox(rootObject)

  return { root, objects, paths }
}

export function syncHierarchyVisibility(node: HierarchyNode, objects: Map<string, Object3D>): HierarchyNode {
  const object = objects.get(node.id)
  return {
    ...node,
    visible: object ? object.visible : node.visible,
    children: node.children.map(child => syncHierarchyVisibility(child, objects)),
  }
}

export function filterHierarchy(node: HierarchyNode, query: string): HierarchyNode | null {
  const q = query.trim().toLowerCase()
  if (!q) return node

  const filteredChildren = node.children
    .map(child => filterHierarchy(child, q))
    .filter((child): child is HierarchyNode => child !== null)

  const selfMatch = node.name.toLowerCase().includes(q) || node.type.toLowerCase().includes(q)
  if (!selfMatch && filteredChildren.length === 0) return null

  return {
    ...node,
    children: selfMatch && filteredChildren.length === 0 ? node.children : filteredChildren,
  }
}

/** Ancestor ids from root → selected (inclusive), for expanding the tree to a node. */
export function findHierarchyPath(node: HierarchyNode, targetId: string): string[] | null {
  if (node.id === targetId) return [node.id]
  for (const child of node.children) {
    const path = findHierarchyPath(child, targetId)
    if (path) return [node.id, ...path]
  }
  return null
}

export function collectExpandIds(node: HierarchyNode, depth = 0, maxDepth = 1): Set<string> {
  const ids = new Set<string>()
  if (depth <= maxDepth) ids.add(node.id)
  if (depth < maxDepth) {
    for (const child of node.children) {
      for (const id of collectExpandIds(child, depth + 1, maxDepth)) ids.add(id)
    }
  }
  return ids
}

/** Ids of all nodes that have children — expand the entire tree. */
export function collectAllExpandIds(node: HierarchyNode): Set<string> {
  const ids = new Set<string>()
  const walk = (n: HierarchyNode) => {
    if (n.children.length === 0) return
    ids.add(n.id)
    for (const child of n.children) walk(child)
  }
  walk(node)
  return ids
}

export type FlatHierarchyRow = {
  node: HierarchyNode
  depth: number
}

/** Flatten the expanded portion of the tree for windowed rendering. */
export function flattenHierarchy(root: HierarchyNode, expanded: Set<string>): FlatHierarchyRow[] {
  const rows: FlatHierarchyRow[] = []
  const walk = (node: HierarchyNode, depth: number) => {
    rows.push({ node, depth })
    if (node.children.length === 0 || !expanded.has(node.id)) return
    for (const child of node.children) walk(child, depth + 1)
  }
  walk(root, 0)
  return rows
}
