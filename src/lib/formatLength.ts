/** Format a world-space length (meters) with an automatic unit. */
export function formatLengthMeters(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  const abs = Math.abs(meters)
  if (abs < 0.01) return `${(meters * 1000).toFixed(1)} mm`
  if (abs < 1) return `${(meters * 100).toFixed(1)} cm`
  if (abs < 100) return `${meters.toFixed(3)} m`
  return `${meters.toFixed(1)} m`
}
