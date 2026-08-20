import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { stripRuntimeUserData } from './exportDecimatedGlb'

describe('stripRuntimeUserData', () => {
  it('removes SwiftMesh runtime extras from the graph', () => {
    const root = new Group()
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    mesh.userData.__shadingData = { originals: { type: 'MeshStandardMaterial' }, temps: null }
    mesh.userData.__hierId = 'h1'
    mesh.userData.keepMe = true
    root.userData.__hierId = 'h0'
    root.add(mesh)

    stripRuntimeUserData(root)

    expect(mesh.userData.__shadingData).toBeUndefined()
    expect(mesh.userData.__hierId).toBeUndefined()
    expect(mesh.userData.keepMe).toBe(true)
    expect(root.userData.__hierId).toBeUndefined()
    mesh.geometry.dispose()
    ;(mesh.material as MeshStandardMaterial).dispose()
  })
})
