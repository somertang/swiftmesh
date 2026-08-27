/** Blender-inspired annotate (pen) and measure (set square) glyphs. */

export function AnnotateToolIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.2 4.4 19.6 9.8 10 19.4H4.6V14Z" />
        <path d="m16.2 6.4 1.5-1.5a1.4 1.4 0 0 1 2 0l1.4 1.4a1.4 1.4 0 0 1 0 2L18.6 9.8" />
        <path d="M5.2 19.8c1.6-.1 3.2.6 4.2 1.6" />
      </g>
    </svg>
  )
}

export function MeasureToolIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.5 19.5V6.2L17.8 19.5Z" />
        <path d="M4.5 10.2h2.2M4.5 13.4h2.2M4.5 16.6h2.2" />
        <path d="M7.8 19.5v-2.2M11 19.5v-2.2M14.2 19.5v-2.2" />
      </g>
    </svg>
  )
}

export function SelectToolIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
      <path
        fill="currentColor"
        d="M5.2 3.1 18.6 11.4l-5.5 1.4 2.8 6.7-2.3 1-2.8-6.6-4.1 3.9Z"
      />
    </svg>
  )
}

export function TranslateToolIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v18M3 12h18" />
        <path d="m12 3 2.2 2.5H9.8Zm0 18 2.2-2.5H9.8ZM3 12l2.5-2.2v4.4Zm18 0-2.5-2.2v4.4Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

export function RotateToolIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2" />
        <path d="M19.5 5.2V9h-3.8" />
      </g>
    </svg>
  )
}

export function ScaleToolIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 6h5v5H6Zm7 7h5v5h-5Z" />
        <path d="m11 11 2 2" />
        <path d="M7.5 4.5 4.5 4.5 4.5 7.5M16.5 19.5h3v-3" />
      </g>
    </svg>
  )
}
