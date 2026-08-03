import type { FC } from 'react'

type Props = {
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}

/** Loadership Stripe Circular Classic — keep custom ring/stripe. */
export const StripeCircularLoader: FC<Props> = ({
  className,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
}) => {
  const classes = ['stripe-circular-loader', className].filter(Boolean).join(' ')
  const decorative = ariaHidden === true || ariaHidden === 'true'

  return (
    <div
      className={classes}
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : ariaLabel}
    >
      <span className="stripe-circular-loader__track" />
      <span className="stripe-circular-loader__stripe" />
    </div>
  )
}
