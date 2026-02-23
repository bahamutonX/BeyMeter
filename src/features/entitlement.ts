export type EntitlementSource = 'local-dev' | 'native-iap' | 'unknown'

export interface EntitlementState {
  isPro: boolean
  source: EntitlementSource
  updatedAt: number
  productId: string | null
}

export interface EntitlementProvider {
  name: string
  getSnapshot: () => EntitlementState
  subscribe?: (onState: (state: EntitlementState) => void) => () => void
  refresh?: () => Promise<EntitlementState>
  setProForDev?: (enabled: boolean) => void
  destroy?: () => void
}

const STORAGE_KEY = 'beymeter:isPro'
const EVENT_NAME = 'beymeter:entitlement-changed'
const DEV_PRODUCT_ID = 'beymeter.pro.dev'

function now(): number {
  return Date.now()
}

function normalizeState(input: EntitlementState): EntitlementState {
  return {
    isPro: Boolean(input.isPro),
    source: input.source ?? 'unknown',
    updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : now(),
    productId: input.productId ?? null,
  }
}

function readLocalProFlag(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === 'true'
}

function createLocalStorageProvider(): EntitlementProvider {
  const buildState = (): EntitlementState => ({
    isPro: readLocalProFlag(),
    source: 'local-dev',
    updatedAt: now(),
    productId: readLocalProFlag() ? DEV_PRODUCT_ID : null,
  })

  return {
    name: 'local-storage',
    getSnapshot: buildState,
    setProForDev: (enabled) => {
      window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
    },
    subscribe: (onState) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY) return
        onState(buildState())
      }
      window.addEventListener('storage', onStorage)
      return () => {
        window.removeEventListener('storage', onStorage)
      }
    },
    refresh: async () => buildState(),
  }
}

let provider: EntitlementProvider = createLocalStorageProvider()
let currentState: EntitlementState = normalizeState(provider.getSnapshot())
let providerUnsubscribe: (() => void) | null = null
const listeners = new Set<() => void>()

function emitChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME))
  listeners.forEach((listener) => listener())
}

function setCurrentState(next: EntitlementState, emit: boolean): void {
  currentState = normalizeState(next)
  if (emit) emitChanged()
}

function bindProviderSubscription(): void {
  providerUnsubscribe?.()
  providerUnsubscribe = null
  if (!provider.subscribe) return
  providerUnsubscribe = provider.subscribe((next) => {
    setCurrentState(next, true)
  })
}

bindProviderSubscription()

export function setEntitlementProvider(nextProvider: EntitlementProvider): void {
  provider.destroy?.()
  provider = nextProvider
  setCurrentState(provider.getSnapshot(), true)
  bindProviderSubscription()
}

export function getEntitlement(): EntitlementState {
  return currentState
}

export async function refreshEntitlement(): Promise<EntitlementState> {
  if (provider.refresh) {
    const refreshed = await provider.refresh()
    setCurrentState(refreshed, true)
    return currentState
  }
  const snapshot = provider.getSnapshot()
  setCurrentState(snapshot, true)
  return currentState
}

export function setProForDev(enabled: boolean): void {
  if (!provider.setProForDev) {
    return
  }
  provider.setProForDev(enabled)
  setCurrentState(provider.getSnapshot(), true)
}

export function subscribeEntitlement(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
