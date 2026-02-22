import { useEffect, useState } from 'react'
import './App.css'
import { AppShell } from './app/AppShell'
import { RawLogPage } from './app/RawLogPage'
import { subscribeNavigation } from './app/navigation'

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
  const [path, setPath] = useState(() => resolveCurrentPath())
  const isRawLogPath =
    path.endsWith('/RawLog') ||
    path.includes('/RawLog/') ||
    path.endsWith('/rawlog') ||
    path.includes('/rawlog/')
  const [showOpening, setShowOpening] = useState(() => !isRawLogPath)

  useEffect(() => {
    if (isRawLogPath) return
    const timer = window.setTimeout(() => {
      setShowOpening(false)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [isRawLogPath])

  useEffect(() => {
    return subscribeNavigation(() => {
      setPath(resolveCurrentPath())
    })
  }, [])

  if (isRawLogPath) {
    return <RawLogPage />
  }

  if (showOpening) {
    return (
      <main className="opening-screen" aria-label="BeyMeter opening">
        <div className="opening-logo">BeyMeter</div>
        <div className="opening-credit">
          by{' '}
          <a href="https://x.com/bahamutonX" target="_blank" rel="noreferrer">
            @BahamutonX
          </a>
        </div>
      </main>
    )
  }

  return <AppShell />
}

export default App
