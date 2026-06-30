import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNativeAuth } from './services/nativeAuth'
import { initAnalytics } from './services/analytics'

// Handle custom-scheme auth deep links in the native app (no-op on the web).
initNativeAuth()

// Set up the anonymous client/session identity and emit session_start.
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
