import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isDevHubPath, isDevResultsPath } from './lib/devPreview'
import './index.css'

const mockAllowed = __SYNCUP_DEV_RESULTS__
const previewName = mockAllowed ? new URLSearchParams(window.location.search).get('preview') : null
const hubPath = isDevHubPath(window.location.pathname)
const resultsPath = isDevResultsPath(window.location.pathname)

if (mockAllowed && resultsPath && !previewName) {
  void import('./dev/resultsPreview').then(({ mountDevResults }) => {
    mountDevResults()
  })
} else if (mockAllowed && (previewName || hubPath)) {
  void import('./dev/fixture').then(({ mountFixture }) => {
    mountFixture(previewName || 'hub')
  })
} else {
  if (resultsPath || hubPath) window.history.replaceState({}, '', '/')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
