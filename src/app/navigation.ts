const NAV_EVENT = 'beymeter:navigate'

export function navigateTo(path: string): void {
  const url = new URL(path, window.location.href)
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(NAV_EVENT))
}

export function subscribeNavigation(listener: () => void): () => void {
  window.addEventListener('popstate', listener)
  window.addEventListener(NAV_EVENT, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(NAV_EVENT, listener)
  }
}
