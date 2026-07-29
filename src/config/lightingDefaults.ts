export type LightingMode = 'studio' | 'classic' | 'neutral'

export type LightingSettings = {
  mode: LightingMode
  /** Renderer toneMappingExposure */
  exposure: number
  /** MeshStandardMaterial.envMapIntensity (IBL strength) */
  envIntensity: number
}

export const LIGHTING_MODE_OPTIONS: { value: LightingMode; label: string }[] = [
  { value: 'studio', label: 'Studio (IBL)' },
  { value: 'classic', label: 'Classic' },
  { value: 'neutral', label: 'Neutral' },
]

export const DEFAULT_LIGHTING: LightingSettings = {
  mode: 'studio',
  exposure: 1,
  envIntensity: 1,
}
