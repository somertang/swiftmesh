import {
  Box3,
  BufferGeometry,
  Mesh,
  Raycaster,
  Vector3,
  type Intersection,
  type Object3D,
} from 'three'
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  MeshBVH,
} from 'three-mesh-bvh'
import { isMeshObject } from './isMeshObject'
import { hierarchyMeshFromHit } from './viewportPick'

let accelerationInstalled = false

/** Patch Three.js Mesh/BufferGeometry for BVH-accelerated raycasts. Idempotent. */
export function installMeshBvhAcceleration() {
  if (accelerationInstalled) return
  accelerationInstalled = true
  Mesh.prototype.raycast = acceleratedRaycast
  // Module augmentation lives on BufferGeometry.prototype via assignment.
  ;(BufferGeometry.prototype as BufferGeometry & {
    computeBoundsTree: typeof computeBoundsTree
  }).computeBoundsTree = computeBoundsTree
  ;(BufferGeometry.prototype as BufferGeometry & {
    disposeBoundsTree: typeof disposeBoundsTree
  }).disposeBoundsTree = disposeBoundsTree
}

function isWorldVisible(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

const _box = new Box3()
const _hitPoint = new Vector3()

/**
 * Intersect ray with a mesh AABB in world space (no triangle tests).
 * Used while BVH is still building so click stays responsive.
 * Overlapping AABBs may pick the wrong mesh until BVH is ready.
 */
function raycastMeshBoundsOnly(mesh: Mesh, raycaster: Raycaster, hits: Intersection[]) {
  const geometry = mesh.geometry
  if (!geometry) return
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const local = geometry.boundingBox
  if (!local || local.isEmpty()) return
  _box.copy(local).applyMatrix4(mesh.matrixWorld)
  const point = raycaster.ray.intersectBox(_box, _hitPoint)
  if (!point) return
  hits.push({
    distance: raycaster.ray.origin.distanceTo(point),
    point: point.clone(),
    object: mesh,
  })
}

/**
 * Pick the hierarchy object under the cursor.
 * Meshes with a boundsTree use BVH; others use AABB only (never full triangle scan).
 */
export function pickHierarchyObject(
  modelRoot: Object3D,
  raycaster: Raycaster
): Object3D | null {
  installMeshBvhAcceleration()
  raycaster.firstHitOnly = true
  const hits: Intersection[] = []

  modelRoot.traverse(object => {
    if (!isMeshObject(object)) return
    if (object.userData.__hierarchyIgnore) return
    if (!isWorldVisible(object)) return

    const geometry = object.geometry as BufferGeometry & { boundsTree?: MeshBVH }
    if (geometry?.boundsTree) {
      object.raycast(raycaster, hits)
    } else {
      raycastMeshBoundsOnly(object, raycaster, hits)
    }
  })

  hits.sort((a, b) => a.distance - b.distance)
  for (const hit of hits) {
    const mesh = hierarchyMeshFromHit(hit.object)
    if (mesh) return mesh
  }
  return null
}

function collectMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse(object => {
    if (!isMeshObject(object)) return
    if (object.userData.__hierarchyIgnore) return
    if (!object.geometry?.getAttribute?.('position')) return
    meshes.push(object)
  })
  return meshes
}

export type MeshBvhBuildHandle = {
  abort: () => void
  done: Promise<void>
}

/**
 * Build BVH for every unique mesh geometry under `root` during idle time.
 * Click stays on AABB until each geometry finishes; never triangle-scans.
 *
 * Uses main-thread `MeshBVH` in idle slices instead of GenerateMeshBVHWorker:
 * glTF often shares ArrayBuffers across meshes, and worker transfers would
 * detach those buffers and break sibling geometries.
 */
export function buildMeshBvhForRoot(root: Object3D): MeshBvhBuildHandle {
  installMeshBvhAcceleration()
  let aborted = false
  const meshes = collectMeshes(root)
  const seenGeometry = new WeakSet<BufferGeometry>()

  const yieldIdle = () =>
    new Promise<void>(resolve => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 120 })
      } else {
        setTimeout(resolve, 0)
      }
    })

  const done = (async () => {
    for (const mesh of meshes) {
      if (aborted) return
      const geometry = mesh.geometry as BufferGeometry & { boundsTree?: MeshBVH }
      if (!geometry || seenGeometry.has(geometry) || geometry.boundsTree) continue
      if (!geometry.getAttribute('position')) continue
      seenGeometry.add(geometry)
      try {
        geometry.boundsTree = new MeshBVH(geometry)
      } catch {
        /* leave AABB-only pick */
      }
      await yieldIdle()
    }
  })()

  return {
    abort: () => {
      aborted = true
    },
    done,
  }
}

export function disposeMeshBvhForRoot(root: Object3D | null) {
  if (!root) return
  root.traverse(object => {
    if (!isMeshObject(object)) return
    const geometry = object.geometry as BufferGeometry & {
      boundsTree?: MeshBVH
      disposeBoundsTree?: () => void
    }
    if (geometry?.boundsTree && typeof geometry.disposeBoundsTree === 'function') {
      geometry.disposeBoundsTree()
    } else if (geometry) {
      geometry.boundsTree = undefined
    }
  })
}
