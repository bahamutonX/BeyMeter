import { useEffect, useState } from 'react'
import './App.css'
import { AppShell } from './app/AppShell'
import type { MainRoute } from './app/AppShell'
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

function resolveMainRoute(path: string): MainRoute {
  if (path.includes('/detail')) return 'detail'
  if (path.includes('/multi')) return 'multi'
  return 'meter'
}

function App() {
  const [path, setPath] = useState(() => resolveCurrentPath())
  const [showOpening, setShowOpening] = useState(() => true)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowOpening(false)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    return subscribeNavigation(() => {
      setPath(resolveCurrentPath())
    })
  }, [])

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

  return <AppShell route={resolveMainRoute(path)} />
}

export default App
