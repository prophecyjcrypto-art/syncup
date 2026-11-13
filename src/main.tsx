import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isDevResultsPath } from './lib/devPreview'
import './index.css'

const devResults = __SYNCUP_DEV_RESULTS__ && isDevResultsPath(window.location.pathname)
const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('preview') : null

if (devResults) {
  void import('./dev/resultsPreview').then(({ mountDevResults }) => {
    mountDevResults()
  })
} else if (preview) {
  void import('./dev/fixture').then(({ mountFixture }) => {
    mountFixture(preview)
  })
} else {
  if (isDevResultsPath(window.location.pathname)) {
    window.history.replaceState({}, '', '/')
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
