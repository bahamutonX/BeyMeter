export function smoothMovingAverage(y: number[], window = 5): number[] {
  if (y.length === 0 || window <= 1) {
    return [...y]
  }
  const w = Math.max(1, Math.floor(window))
  const half = Math.floor(w / 2)
  const out = new Array<number>(y.length)
  for (let i = 0; i < y.length; i += 1) {
    const s = Math.max(0, i - half)
    const e = Math.min(y.length - 1, i + half)
    let sum = 0
    let count = 0
    for (let j = s; j <= e; j += 1) {
      const v = y[j]
      if (Number.isFinite(v)) {
        sum += v
        count += 1
      }
    }
    out[i] = count > 0 ? sum / count : y[i]
  }
  return out
}

export function derivativeCentral(x: number[], y: number[]): number[] {
  const n = Math.min(x.length, y.length)
  if (n === 0) {
    return []
  }
  if (n === 1) {
    return [0]
  }

  const d = new Array<number>(n)

  const dx0 = x[1] - x[0]
  d[0] = dx0 !== 0 ? (y[1] - y[0]) / dx0 : 0

  for (let i = 1; i < n - 1; i += 1) {
    const dx = x[i + 1] - x[i - 1]
    d[i] = dx !== 0 ? (y[i + 1] - y[i - 1]) / dx : d[i - 1]
  }

  const dxN = x[n - 1] - x[n - 2]
  d[n - 1] = dxN !== 0 ? (y[n - 1] - y[n - 2]) / dxN : d[n - 2]

  return d.map((v) => (Number.isFinite(v) ? v : 0))
}
