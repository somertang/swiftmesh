import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector2,
} from 'three'
import { describe, expect, it } from 'vitest'
import { pickHierarchyObject } from './meshBvh'
import { buildSceneHierarchy } from './sceneHierarchy'

/** Dense triangle soup — enough that a naive raycast would be expensive. */
function makeDenseMesh(triangleCount: number): Mesh {
  const positions = new Float32Array(triangleCount * 9)
  for (let i = 0; i < triangleCount; i++) {
    const o = i * 9
    const x = (i % 100) * 0.01
    const z = Math.floor(i / 100) * 0.01
    positions[o] = x
    positions[o + 1] = 0
    positions[o + 2] = z
    positions[o + 3] = x + 0.01
    positions[o + 4] = 0
    positions[o + 5] = z
    positions[o + 6] = x
    positions[o + 7] = 0.01
    positions[o + 8] = z + 0.01
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeBoundingBox()
  return new Mesh(geometry, new MeshBasicMaterial())
}

describe('pickHierarchyObject performance', () => {
  it('stays fast on a dense mesh without BVH (AABB path)', () => {
    const mesh = makeDenseMesh(200_000)
    buildSceneHierarchy(mesh)
    mesh.updateWorldMatrix(true, true)

    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0.5, 2, 0.5)
    camera.lookAt(0.5, 0, 0.5)
    camera.updateMatrixWorld()

    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(0, 0), camera)

    const t0 = performance.now()
    const picked = pickHierarchyObject(mesh, raycaster)
    const elapsed = performance.now() - t0

    expect(picked).toBe(mesh)
    // Full triangle scan of 200k tris is typically hundreds of ms; AABB should be << 50ms.
    expect(elapsed).toBeLessThan(50)
  })
})
