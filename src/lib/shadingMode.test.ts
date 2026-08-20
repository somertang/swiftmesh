import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { applyShadingMode } from './shadingMode'

describe('applyShadingMode', () => {
  it('ignores glTF-serialized __shadingData and keeps a live material', () => {
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometry, material)
    mesh.userData.__shadingData = {
      originals: { type: 'MeshStandardMaterial', uuid: 'not-a-material' },
      temps: null,
    }

    applyShadingMode(mesh, 'material')

    expect((mesh.material as MeshStandardMaterial).isMaterial).toBe(true)
    expect(mesh.material).toBe(material)
    geometry.dispose()
    material.dispose()
  })
})
