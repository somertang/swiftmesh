import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2 } from 'three'
import { describe, expect, it } from 'vitest'
import { pickHierarchyObject } from './meshBvh'
import { buildSceneHierarchy } from './sceneHierarchy'

describe('pickHierarchyObject', () => {
  it('picks a mesh via AABB when BVH is not built', () => {
    const root = new Group()
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
    mesh.position.set(0, 0, 0)
    root.add(mesh)
    buildSceneHierarchy(root)
    root.updateWorldMatrix(true, true)

    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(0, 0), camera)
    const picked = pickHierarchyObject(root, raycaster)
    expect(picked).toBe(mesh)
  })
})
