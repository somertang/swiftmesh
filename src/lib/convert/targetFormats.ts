import type { ModelFormat } from '../modelSource'

export type ConvertTargetFormat = 'glb' | 'gltf'

/** Target formats allowed for a given source (UI Select options). */
export function allowedConvertTargets(source: ModelFormat): ConvertTargetFormat[] {
  if (source === 'glb') return ['gltf']
  if (source === 'gltf') return ['glb']
  if (source === 'obj' || source === 'fbx') return ['glb']
  return []
}

export function defaultConvertTarget(source: ModelFormat): ConvertTargetFormat | null {
  return allowedConvertTargets(source)[0] ?? null
}
