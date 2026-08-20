import { BufferGeometry, type Mesh, type Object3D } from 'three'
import { isMeshObject } from '../isMeshObject'
import {
  countSkipReasons,
  decimateSkipReason,
  type DecimateSkipReason,
} from './decimateEligibility'
import { decimateWeldedGeometry } from './decimateGeometry'
import { achievementRatio, triangleCountOf } from './decimateMath'
import { disposeWeldedSource, weldGeometry, type WeldedSource } from './weldGeometry'

export type DecimatePhase = 'idle' | 'welding' | 'ready' | 'applying' | 'error'

export type DecimateStats = {
  phase: DecimatePhase
  weldDone: number
  weldTotal: number
  eligibleCount: number
  skippedSkinned: number
  skippedMorph: number
  skippedSmall: number
  originalTriangles: number
  originalVertices: number
  actualTriangles: number
  actualVertices: number
  targetTriangles: number
  targetRatio: number
  actualRatio: number
  /** meshoptimizer returned error from the last simplify pass (max across meshes). */
  simplificationError: number | null
  error: string | null
}

export const EMPTY_DECIMATE_STATS: DecimateStats = {
  phase: 'idle',
  weldDone: 0,
  weldTotal: 0,
  eligibleCount: 0,
  skippedSkinned: 0,
  skippedMorph: 0,
  skippedSmall: 0,
  originalTriangles: 0,
  originalVertices: 0,
  actualTriangles: 0,
  actualVertices: 0,
  targetTriangles: 0,
  targetRatio: 1,
  actualRatio: 1,
  simplificationError: null,
  error: null,
}

type Candidate = {
  mesh: Mesh
  originalGeometry: BufferGeometry
  skipReason: DecimateSkipReason | null
  originalVertexCount: number
  originalTriangleCount: number
}

function geometryHasMorphTargets(geometry: BufferGeometry): boolean {
  const morph = geometry.morphAttributes
  return Object.values(morph).some(list => (list?.length ?? 0) > 0)
}

function isSkinnedMesh(mesh: Mesh): boolean {
  return (mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh === true
}

function collectCandidates(root: Object3D): Candidate[] {
  const candidates: Candidate[] = []
  root.traverse(child => {
    if (child.userData.__hierarchyIgnore) return
    if (!isMeshObject(child) || !child.geometry) return
    const geometry = child.geometry
    const position = geometry.getAttribute('position')
    const vertexCount = position?.count ?? 0
    const triangleCount = triangleCountOf(geometry.getIndex()?.count ?? null, vertexCount)
    candidates.push({
      mesh: child,
      originalGeometry: geometry,
      skipReason: decimateSkipReason({
        isSkinned: isSkinnedMesh(child),
        hasMorphTargets: geometryHasMorphTargets(geometry),
        triangleCount,
      }),
      originalVertexCount: vertexCount,
      originalTriangleCount: triangleCount,
    })
  })
  return candidates
}

export class DecimateSession {
  private readonly candidates: Candidate[]
  private readonly originalByMesh = new Map<Mesh, BufferGeometry>()
  private readonly weldedByUuid = new Map<string, WeldedSource>()
  private readonly generatedByUuid = new Map<string, BufferGeometry>()
  private disposed = false
  private generation = 0

  constructor(root: Object3D) {
    this.candidates = collectCandidates(root)
    for (const candidate of this.candidates) {
      this.originalByMesh.set(candidate.mesh, candidate.originalGeometry)
    }
  }

  get eligible(): Candidate[] {
    return this.candidates.filter(candidate => candidate.skipReason == null)
  }

  baseStats(): DecimateStats {
    const skip = countSkipReasons(this.candidates.map(c => c.skipReason))
    let originalTriangles = 0
    let originalVertices = 0
    for (const candidate of this.candidates) {
      originalTriangles += candidate.originalTriangleCount
      originalVertices += candidate.originalVertexCount
    }
    return {
      ...EMPTY_DECIMATE_STATS,
      ...skip,
      originalTriangles,
      originalVertices,
      actualTriangles: originalTriangles,
      actualVertices: originalVertices,
      targetTriangles: originalTriangles,
      targetRatio: 1,
      actualRatio: 1,
    }
  }

  async prepare(onProgress?: (done: number, total: number) => void): Promise<void> {
    const unique = new Map<string, BufferGeometry>()
    for (const candidate of this.eligible) {
      const uuid = candidate.originalGeometry.uuid
      if (!unique.has(uuid)) unique.set(uuid, candidate.originalGeometry)
    }
    const entries = [...unique.entries()]
    const total = entries.length
    onProgress?.(0, total)
    for (let i = 0; i < entries.length; i++) {
      if (this.disposed) return
      const [uuid, geometry] = entries[i]!
      this.weldedByUuid.set(uuid, weldGeometry(geometry))
      onProgress?.(i + 1, total)
      if ((i + 1) % 6 === 0) {
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0)
        })
      }
    }
  }

  async apply(ratio: number, lockBorder: boolean): Promise<DecimateStats> {
    const gen = ++this.generation
    const stats = this.baseStats()
    stats.phase = 'applying'
    stats.targetRatio = ratio

    let targetTriangles = 0
    let actualTriangles = 0
    let actualVertices = 0
    let simplificationError = 0
    const skippedOriginalTriangles = this.candidates
      .filter(c => c.skipReason != null)
      .reduce((sum, c) => sum + c.originalTriangleCount, 0)
    const skippedOriginalVertices = this.candidates
      .filter(c => c.skipReason != null)
      .reduce((sum, c) => sum + c.originalVertexCount, 0)

    const uniqueEligible = new Map<string, WeldedSource>()
    for (const candidate of this.eligible) {
      const welded = this.weldedByUuid.get(candidate.originalGeometry.uuid)
      if (welded) uniqueEligible.set(candidate.originalGeometry.uuid, welded)
    }

    const applied = new Map<
      string,
      { geometry: BufferGeometry; triangles: number; vertices: number; target: number; error: number }
    >()

    for (const [uuid, welded] of uniqueEligible) {
      if (this.disposed || gen !== this.generation) return stats
      const result = await decimateWeldedGeometry(welded, { ratio, lockBorder })
      if (this.disposed || gen !== this.generation) {
        result.geometry.dispose()
        return stats
      }
      const previous = this.generatedByUuid.get(uuid)
      if (previous && previous !== result.geometry) previous.dispose()
      this.generatedByUuid.set(uuid, result.geometry)
      applied.set(uuid, {
        geometry: result.geometry,
        triangles: result.triangleCount,
        vertices: result.vertexCount,
        target: result.targetTriangleCount,
        error: result.error,
      })
    }

    for (const candidate of this.eligible) {
      const next = applied.get(candidate.originalGeometry.uuid)
      if (!next) continue
      candidate.mesh.geometry = next.geometry
      actualTriangles += next.triangles
      actualVertices += next.vertices
      targetTriangles += next.target
      simplificationError = Math.max(simplificationError, next.error)
    }

    stats.phase = 'ready'
    stats.weldDone = this.weldedByUuid.size
    stats.weldTotal = this.weldedByUuid.size
    stats.actualTriangles = actualTriangles + skippedOriginalTriangles
    stats.actualVertices = actualVertices + skippedOriginalVertices
    stats.targetTriangles = targetTriangles + skippedOriginalTriangles
    stats.simplificationError = simplificationError
    const eligibleOriginal = this.eligible.reduce((sum, c) => sum + c.originalTriangleCount, 0)
    stats.actualRatio = achievementRatio(actualTriangles, eligibleOriginal)
    return stats
  }

  restore() {
    for (const [mesh, geometry] of this.originalByMesh) {
      mesh.geometry = geometry
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.restore()
    for (const generated of this.generatedByUuid.values()) generated.dispose()
    this.generatedByUuid.clear()
    for (const welded of this.weldedByUuid.values()) disposeWeldedSource(welded)
    this.weldedByUuid.clear()
  }
}
