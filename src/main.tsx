import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNativeAuth } from './services/nativeAuth'

// Handle custom-scheme auth deep links in the native app (no-op on the web).
initNativeAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
