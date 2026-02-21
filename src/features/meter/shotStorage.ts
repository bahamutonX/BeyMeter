import type { ShotProfile } from '../ble/bbpTypes'
import type { ShotFeatures } from './shotFeatures'
import type { DecaySegment } from '../../analysis/decayDetect'
import type { FrictionFitResult } from '../../analysis/frictionFit'
import type { TorqueFeatures, TorqueSeries } from '../../analysis/torque'
import type { LauncherType } from './shootType'

const DB_NAME = 'beymeter-db'
const DB_VERSION = 1
const SHOTS_STORE = 'shots'

export type ShotLabel = 'HIGH' | 'MID' | 'LOW'
export type ChosenSpType = 'your' | 'est' | 'max'

export interface PersistentShot {
  id: string
  beySessionId?: string
  launcherType?: LauncherType
  createdAt: number
  yourSp: number
  estSp: number
  maxSp: number
  chosenSpType: ChosenSpType
  launchMarkerMs?: number | null
  profile: ShotProfile
  features: ShotFeatures
  decaySegment?: DecaySegment | null
  frictionFit?: FrictionFitResult | null
  torqueSeries?: TorqueSeries | null
  torqueFeatures?: TorqueFeatures | null
  label: ShotLabel
  memo?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SHOTS_STORE)) {
        db.createObjectStore(SHOTS_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

function runTx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(SHOTS_STORE, mode)
        const store = tx.objectStore(SHOTS_STORE)
        run(store, resolve, reject)
        tx.oncomplete = () => db.close()
        tx.onerror = () => reject(tx.error)
      })
      .catch(reject)
  })
}

export function classifyLabel(estSp: number): ShotLabel {
  if (estSp >= 10000) return 'HIGH'
  if (estSp >= 3000) return 'MID'
  return 'LOW'
}

export async function saveShot(shot: PersistentShot): Promise<void> {
  await runTx<void>('readwrite', (store, resolve, reject) => {
    const req = store.put(shot)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function listShots(): Promise<PersistentShot[]> {
  return runTx<PersistentShot[]>('readonly', (store, resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => {
      const all = (req.result as PersistentShot[]).sort((a, b) => b.createdAt - a.createdAt)
      resolve(all)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function clearShots(): Promise<void> {
  await runTx<void>('readwrite', (store, resolve, reject) => {
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function importShots(shots: PersistentShot[]): Promise<void> {
  await runTx<void>('readwrite', (store, resolve, reject) => {
    try {
      for (const shot of shots) {
        store.put(shot)
      }
      store.transaction.oncomplete = () => resolve()
      store.transaction.onerror = () => reject(store.transaction.error)
    } catch (error) {
      reject(error)
    }
  })
}

export async function updateShotMemo(id: string, memo: string): Promise<void> {
  const shots = await listShots()
  const target = shots.find((x) => x.id === id)
  if (!target) {
    return
  }
  await saveShot({
    ...target,
    memo,
  })
}
