export function buildTimeGrid(start: number, end: number, step: number): number[] {
  const out: number[] = []
  for (let x = start; x <= end; x += step) {
    out.push(x)
  }
  return out
}

export function resampleLinear(time: number[], value: number[], newTime: number[]): number[] {
  if (time.length < 2 || value.length < 2) {
    return newTime.map(() => Number.NaN)
  }

  return newTime.map((x) => {
    if (x < time[0] || x > time[time.length - 1]) {
      return Number.NaN
    }
    for (let i = 1; i < time.length; i += 1) {
      const x0 = time[i - 1]
      const x1 = time[i]
      if (x1 >= x) {
        const y0 = value[i - 1]
        const y1 = value[i]
        if (x1 === x0) return y0
        const t = (x - x0) / (x1 - x0)
        return y0 + (y1 - y0) * t
      }
    }
    return Number.NaN
  })
}
