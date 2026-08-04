import Button, { type ButtonProps } from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import type { FC, ReactNode } from 'react'

export type LoadingButtonProps = Omit<ButtonProps, 'startIcon'> & {
  loading?: boolean
  /** Label shown beside the spinner while loading. Defaults to `children`. */
  loadingText?: ReactNode
  startIcon?: ButtonProps['startIcon']
}

/** Button that shows a small spinner + text while an async action runs. */
export const LoadingButton: FC<LoadingButtonProps> = ({
  loading = false,
  loadingText,
  disabled,
  children,
  startIcon,
  ...rest
}) => (
  <Button
    {...rest}
    disabled={Boolean(disabled) || loading}
    aria-busy={loading || undefined}
    startIcon={
      loading ? <CircularProgress color="inherit" size={16} thickness={5} /> : startIcon
    }
  >
    {loading ? (loadingText ?? children) : children}
  </Button>
)
