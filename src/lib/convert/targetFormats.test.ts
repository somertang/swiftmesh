import { describe, expect, it } from 'vitest'
import { allowedConvertTargets, defaultConvertTarget } from './targetFormats'

describe('allowedConvertTargets', () => {
  it('maps source formats to allowed targets', () => {
    expect(allowedConvertTargets('glb')).toEqual(['gltf'])
    expect(allowedConvertTargets('gltf')).toEqual(['glb'])
    expect(allowedConvertTargets('obj')).toEqual(['glb'])
    expect(allowedConvertTargets('fbx')).toEqual(['glb'])
  })

  it('picks the first allowed target as default', () => {
    expect(defaultConvertTarget('glb')).toBe('gltf')
    expect(defaultConvertTarget('obj')).toBe('glb')
  })
})
