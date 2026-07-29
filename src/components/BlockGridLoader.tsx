import type { FC } from 'react'

type Props = {
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}

const CELLS = 9

export const BlockGridLoader: FC<Props> = ({
  className,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
}) => {
  const classes = ['block-grid-loader', className].filter(Boolean).join(' ')
  const decorative = ariaHidden === true || ariaHidden === 'true'

  return (
    <div
      className={classes}
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : ariaLabel}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <span key={i} className="block-grid-loader__cell" />
      ))}
    </div>
  )
}
