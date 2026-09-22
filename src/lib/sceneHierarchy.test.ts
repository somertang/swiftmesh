import { Box3, Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildSceneHierarchy,
  FIT_WORLD_BOX_KEY,
  flattenHierarchy,
  collectAllExpandIds,
  hierarchyClipboardTree,
} from './sceneHierarchy'

describe('buildSceneHierarchy', () => {
  it('records ancestor paths for each node', () => {
    const root = new Group()
    root.name = 'Root'
    const child = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    child.name = 'ChildMesh'
    root.add(child)

    const built = buildSceneHierarchy(root)
    const childId = child.userData.__hierId as string
    expect(built.paths.get(childId)).toEqual(['scene-root', root.userData.__hierId, childId])
    expect(built.paths.get('scene-root')).toEqual(['scene-root'])
  })

  it('caches world fit boxes on meshes', () => {
    const root = new Group()
    const child = new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial())
    root.add(child)
    buildSceneHierarchy(root)
    const box = child.userData[FIT_WORLD_BOX_KEY] as Box3
    expect(box).toBeInstanceOf(Box3)
    expect(box.isEmpty()).toBe(false)
    const dims = box.getSize(new Vector3())
    expect(dims.x).toBeCloseTo(2, 5)
    expect(dims.y).toBeCloseTo(4, 5)
    expect(dims.z).toBeCloseTo(6, 5)
  })
})

describe('hierarchyClipboardTree', () => {
  it('skips the scene root and omits empty children', () => {
    const root = new Group()
    root.name = 'Root'
    const group = new Group()
    group.name = 'Arm'
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    mesh.name = 'Hand'
    group.add(mesh)
    root.add(group)
    const { root: tree } = buildSceneHierarchy(root)
    expect(hierarchyClipboardTree(tree)).toEqual({
      name: 'Root',
      children: [{ name: 'Arm', children: [{ name: 'Hand' }] }],
    })
  })
})

describe('flattenHierarchy', () => {
  it('only walks expanded branches', () => {
    const root = new Group()
    root.name = 'Root'
    const a = new Group()
    a.name = 'A'
    const b = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    b.name = 'B'
    a.add(b)
    root.add(a)
    const { root: tree } = buildSceneHierarchy(root)
    const expanded = new Set(['scene-root', root.userData.__hierId as string])
    const rows = flattenHierarchy(tree, expanded)
    expect(rows.map(r => r.node.name)).toEqual(['Scene', 'Root', 'A'])
  })

  it('includes all nodes when fully expanded', () => {
    const root = new Group()
    const child = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    root.add(child)
    const { root: tree } = buildSceneHierarchy(root)
    const rows = flattenHierarchy(tree, collectAllExpandIds(tree))
    expect(rows.length).toBe(3)
  })
})
