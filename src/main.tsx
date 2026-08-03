import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './icons/register'
import App from './App'
import { LocaleProvider } from './i18n'
import { PreviewThemeProvider } from './previewTheme'
import { UiThemeProvider } from './uiTheme'
import './index.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <UiThemeProvider>
        <PreviewThemeProvider>
          <App />
        </PreviewThemeProvider>
      </UiThemeProvider>
    </LocaleProvider>
  </StrictMode>,
)

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__swiftmeshSplashReady?.()
  })
})
