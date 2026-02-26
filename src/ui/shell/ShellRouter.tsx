import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../app/AppShell'
import type { MainRoute } from '../../app/AppShell'

type OrientationMode = 'portrait' | 'landscape'

function detectOrientation(): OrientationMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'portrait'
  }
  const mqLandscape = window.matchMedia('(orientation: landscape)')
  if (mqLandscape.matches) return 'landscape'
  return 'portrait'
}

interface ShellRouterProps {
  route: MainRoute
}

export function ShellRouter({ route }: ShellRouterProps) {
  const [orientation, setOrientation] = useState<OrientationMode>(() => detectOrientation())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mqPortrait = window.matchMedia('(orientation: portrait)')
    const mqLandscape = window.matchMedia('(orientation: landscape)')
    const update = () => {
      setOrientation(mqLandscape.matches ? 'landscape' : 'portrait')
    }

    update()
    mqPortrait.addEventListener('change', update)
    mqLandscape.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      mqPortrait.removeEventListener('change', update)
      mqLandscape.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  const layoutMode = useMemo<'mobile' | 'desktop'>(
    () => (orientation === 'landscape' ? 'desktop' : 'mobile'),
    [orientation],
  )

  return <AppShell route={route} layoutMode={layoutMode} />
}

