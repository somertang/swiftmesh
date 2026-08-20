import { describe, expect, it } from 'vitest'
import { createTriangleSoupQuad, weldGeometry } from './weldGeometry'

describe('weldGeometry', () => {
  it('welds a triangle-soup quad down to four unique vertices', () => {
    const soup = createTriangleSoupQuad()
    expect(soup.getAttribute('position').count).toBe(6)
    const welded = weldGeometry(soup)
    expect(welded.originalVertexCount).toBe(6)
    expect(welded.originalTriangleCount).toBe(2)
    expect(welded.weldedVertexCount).toBe(4)
    expect(welded.weldedTriangleCount).toBe(2)
    expect(welded.indices.length).toBe(6)
    soup.dispose()
    welded.geometry.dispose()
  })
})
