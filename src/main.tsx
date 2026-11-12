import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('preview') : null

if (preview) {
  void import('./dev/fixture').then(({ mountFixture }) => {
    mountFixture(preview)
  })
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
