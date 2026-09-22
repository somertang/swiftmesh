import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { hierarchyMeshFromHit, isViewportClick } from './viewportPick'

function mesh() {
  return new Mesh(new BoxGeometry(), new MeshBasicMaterial())
}

describe('isViewportClick', () => {
  it('treats a still short press as a click', () => {
    expect(isViewportClick({ x: 40, y: 80 }, { x: 40, y: 80 })).toBe(true)
    expect(isViewportClick({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(true)
    expect(isViewportClick({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true)
  })

  it('treats movement past the threshold as a drag', () => {
    expect(isViewportClick({ x: 0, y: 0 }, { x: 11, y: 0 })).toBe(false)
    expect(isViewportClick({ x: 4, y: 4 }, { x: 4, y: 20 })).toBe(false)
  })

  it('is not a click when pointerdown was never recorded', () => {
    expect(isViewportClick(null, { x: 4, y: 4 })).toBe(false)
  })
})

describe('hierarchyMeshFromHit', () => {
  it('returns the hit mesh __hierId', () => {
    const hit = mesh()
    hit.userData.__hierId = 'h4'
    expect(hierarchyMeshFromHit(hit)?.userData.__hierId).toBe('h4')
  })

  it('walks from an ignore helper to the parent mesh', () => {
    const parent = mesh()
    parent.userData.__hierId = 'h2'
    const helper = mesh()
    helper.userData.__hierarchyIgnore = true
    helper.userData.__hierId = 'ignore-me'
    parent.add(helper)
    expect(hierarchyMeshFromHit(helper)?.userData.__hierId).toBe('h2')
  })

  it('returns null on a miss so selection can clear', () => {
    expect(hierarchyMeshFromHit(null)).toBeNull()
    const stray = mesh()
    expect(hierarchyMeshFromHit(stray)).toBeNull()
    const ignored = mesh()
    ignored.userData.__hierarchyIgnore = true
    expect(hierarchyMeshFromHit(ignored)).toBeNull()
  })
})
