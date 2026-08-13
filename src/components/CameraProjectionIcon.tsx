import type { CameraProjection } from '../config/cameraDefaults'

/** Blender-style persp/ortho glyphs: flat 3×3 grid vs receding floor grid. */
export function CameraProjectionIcon({ projection }: { projection: CameraProjection }) {
  if (projection === 'orthographic') {
    return (
      <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="square"
        >
          <rect x="3.5" y="3.5" width="17" height="17" />
          <path d="M3.5 9.17h17M3.5 14.83h17M9.17 3.5v17M14.83 3.5v17" />
        </g>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M7.2 5.2h9.6L20.5 18.8H3.5z" />
        <path d="M6.35 9.7h11.3M4.9 14.3h14.2" />
        <path d="M10.4 5.2 7.15 18.8M13.6 5.2 16.85 18.8" />
      </g>
    </svg>
  )
}
