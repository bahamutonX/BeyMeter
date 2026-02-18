import './App.css'
import { AppShell } from './app/AppShell'
import { RawLogPage } from './app/RawLogPage'

function resolveCurrentPath(): string {
  const current = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const redirect = params.get('p')
  if (redirect) {
    const decoded = decodeURIComponent(redirect)
    const next = decoded.startsWith('/') ? decoded : `/${decoded}`
    window.history.replaceState(null, '', next)
    return next
  }
  return current
}

function App() {
  const path = resolveCurrentPath()
  if (path.endsWith('/rawlog') || path.includes('/rawlog/')) {
    return <RawLogPage />
  }
  return <AppShell />
}

export default App
