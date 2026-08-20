import { describe, expect, it } from 'vitest'
import { BoxGeometry } from 'three'
import { achievementRatio } from './decimateMath'
import { decimateWeldedGeometry } from './decimateGeometry'
import { weldGeometry } from './weldGeometry'

describe('decimateWeldedGeometry', () => {
  it('reduces a dense box below the target ratio', async () => {
    const box = new BoxGeometry(1, 1, 1, 24, 24, 24)
    const welded = weldGeometry(box)
    const before = welded.weldedTriangleCount
    expect(before).toBeGreaterThan(1000)
    const result = await decimateWeldedGeometry(welded, { ratio: 0.25, lockBorder: false })
    expect(result.triangleCount).toBeLessThan(before)
    expect(result.vertexCount).toBeLessThan(welded.weldedVertexCount)
    expect(result.triangleCount).toBeGreaterThan(0)
    box.dispose()
    welded.geometry.dispose()
    result.geometry.dispose()
  })

  it('auto-solves error to reach roughly the requested keep ratio', async () => {
    const box = new BoxGeometry(1, 1, 1, 32, 32, 32)
    const welded = weldGeometry(box)
    const before = welded.weldedTriangleCount
    const result = await decimateWeldedGeometry(welded, { ratio: 0.5, lockBorder: false })
    const actualRatio = achievementRatio(result.triangleCount, before)
    expect(actualRatio).toBeGreaterThan(0.45)
    expect(actualRatio).toBeLessThan(0.56)
    box.dispose()
    welded.geometry.dispose()
    result.geometry.dispose()
  })
})
