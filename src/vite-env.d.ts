import type { DesktopApi } from './desktopTypes'

declare global {
  interface Window {
    desktop?: DesktopApi
    __swiftmeshSplashReady?: () => void
  }
}

export {}
