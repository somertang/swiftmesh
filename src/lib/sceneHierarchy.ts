import { Mesh, type Object3D } from 'three'

export type HierarchyNode = {
  id: string
  name: string
  type: string
  kind: 'mesh' | 'group' | 'object'
  childCount: number
  visible: boolean
  children: HierarchyNode[]
}

export type HierarchyBuildResult = {
  root: HierarchyNode
  objects: Map<string, Object3D>
}

function nodeKind(object: Object3D): HierarchyNode['kind'] {
  if (object instanceof Mesh) return 'mesh'
  if (object.children.length > 0) return 'group'
  return 'object'
}

function displayName(object: Object3D) {
  const name = object.name?.trim()
  if (name) return name
  return object.type || 'Object'
}

/** Walk a loaded model root and build a UI tree + id→Object3D map. */
export function buildSceneHierarchy(rootObject: Object3D): HierarchyBuildResult {
  const objects = new Map<string, Object3D>()
  let nextId = 0

  const walk = (object: Object3D): HierarchyNode => {
    const id = `h${nextId++}`
    object.userData.__hierId = id
    objects.set(id, object)

    const children = object.children
      .filter(child => !child.userData.__hierarchyIgnore)
      .map(walk)

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

  const modelTree = walk(rootObject)
  const root: HierarchyNode = {
    id: 'scene-root',
    name: 'Scene',
    type: 'Scene',
    kind: 'group',
    childCount: 1,
    visible: true,
    children: [modelTree],
  }

  return { root, objects }
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
