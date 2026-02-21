import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { PersistentShot } from '../features/meter/shotStorage'
import { aggregateSeries } from '../analysis/aggregateSeries'

export type BandChartMode = 'avg' | 'overlay'

interface BandChartProps {
  shots: PersistentShot[]
  mode: BandChartMode
  rangeStart?: number
  rangeEnd?: number
  fixedSpYMin?: number
  fixedSpYMax?: number
  fixedXTicks?: number[]
  fixedSpYTicks?: number[]
  xLabel?: string
  spYLabel?: string
  torqueYLabel?: string
  maxOverlay?: number
  launchMarkerMsAvg?: number | null
}

function buildTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (min === max) return [min]
  const ticks: number[] = []
  const step = (max - min) / Math.max(1, count - 1)
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i)
  return ticks
}

function safeRange(values: number[], fallback: [number, number]): [number, number] {
  const valid = values.filter((v) => Number.isFinite(v))
  if (valid.length === 0) return fallback
  let min = Math.min(...valid)
  let max = Math.max(...valid)
  if (min > 0) min = 0
  if (min === max) max += 1
  return [min, max]
}

function drawStepSeries(
  ctx: CanvasRenderingContext2D,
  tMs: number[],
  y: number[],
  xAt: (t: number) => number,
  yAt: (v: number) => number,
  rangeStart: number,
  rangeEnd: number,
) {
  if (tMs.length === 0 || y.length === 0) return
  let started = false
  let prevX = 0
  let prevY = 0

  for (let i = 0; i < Math.min(tMs.length, y.length); i += 1) {
    const tx = tMs[i]
    const vy = y[i]
    if (!Number.isFinite(tx) || !Number.isFinite(vy)) continue
    if (tx < rangeStart) continue
    if (tx > rangeEnd) break
    const x = xAt(tx)
    const py = yAt(vy)
    if (!started) {
      ctx.moveTo(x, py)
      started = true
    } else {
      ctx.lineTo(x, prevY)
      ctx.lineTo(x, py)
    }
    prevX = x
    prevY = py
  }
  if (started) {
    ctx.lineTo(prevX, prevY)
  }
}

export function BandChart({
  shots,
  mode,
  rangeStart = 0,
  rangeEnd = 400,
  fixedSpYMin = 0,
  fixedSpYMax = 12000,
  fixedXTicks,
  fixedSpYTicks,
  xLabel = 'Time (ms)',
  spYLabel = 'Shot Power (rpm)',
  torqueYLabel = 'Input Torque (Relative)',
  maxOverlay = 20,
  launchMarkerMsAvg = null,
}: BandChartProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.floor(width * window.devicePixelRatio)
    canvas.height = Math.floor(height * window.devicePixelRatio)
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#0b1528'
    ctx.fillRect(0, 0, width, height)

    const spSeries = shots
      .map((s) => {
        const p = s.profile
        if (!p || p.tMs.length < 2 || p.sp.length < 2) return null
        const t0 = p.tMs[0] ?? 0
        return { t: p.tMs.map((tt) => tt - t0), y: p.sp }
      })
      .filter((s): s is { t: number[]; y: number[] } => s !== null)

    const tauSeries = shots
      .map((s) => {
        const p = s.torqueSeries
        if (!p || p.tMs.length < 2 || p.tau.length < 2) return null
        const t0 = p.tMs[0] ?? 0
        return { t: p.tMs.map((tt) => tt - t0), y: p.tau }
      })
      .filter((s): s is { t: number[]; y: number[] } => s !== null)

    if (spSeries.length === 0) {
      ctx.fillStyle = '#8fa7bf'
      ctx.font = '12px sans-serif'
      ctx.fillText(t('chart.insufficientBandData'), 12, 20)
      return
    }

    const padLeft = 62
    const padRight = 56
    const padTop = 16
    const padBottom = 38
    const innerW = width - padLeft - padRight
    const innerH = height - padTop - padBottom

    const xAt = (tVal: number) => padLeft + ((tVal - rangeStart) / Math.max(1, rangeEnd - rangeStart)) * innerW
    const ySpAt = (v: number) => padTop + (1 - (v - fixedSpYMin) / Math.max(1, fixedSpYMax - fixedSpYMin)) * innerH

    let displaySpT: number[] = []
    let displaySpY: number[] = []
    let displayTauT: number[] = []
    let displayTauY: number[] = []

    if (mode === 'overlay') {
      const sampledSp = spSeries.slice(0, Math.min(maxOverlay, spSeries.length))
      const sampledTau = tauSeries.slice(0, Math.min(maxOverlay, tauSeries.length))

      sampledSp.forEach((series, idx) => {
        ctx.strokeStyle = `rgba(88,224,255,${Math.max(0.08, 0.3 - idx * 0.01)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(xAt(series.t[0]), ySpAt(series.y[0]))
        for (let i = 1; i < series.t.length; i += 1) {
          if (series.t[i] < rangeStart || series.t[i] > rangeEnd) continue
          ctx.lineTo(xAt(series.t[i]), ySpAt(series.y[i]))
        }
        ctx.stroke()
      })

      // For peak guides/meta in overlay mode, use averaged line for stability.
      const aggSp = aggregateSeries(spSeries, rangeStart, rangeEnd, 1)
      displaySpT = aggSp.newTime
      displaySpY = aggSp.mean

      if (sampledTau.length > 0) {
        const aggTau = aggregateSeries(sampledTau, rangeStart, rangeEnd, 1)
        displayTauT = aggTau.newTime
        displayTauY = aggTau.mean
      }
    } else {
      const aggSp = aggregateSeries(spSeries, rangeStart, rangeEnd, 1)
      displaySpT = aggSp.newTime
      displaySpY = aggSp.mean

      ctx.strokeStyle = 'rgba(88,224,255,0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      let startedBand = false
      for (let i = 0; i < aggSp.newTime.length; i += 1) {
        const x = aggSp.newTime[i]
        const y = aggSp.p25[i]
        if (!Number.isFinite(y)) continue
        if (!startedBand) {
          ctx.moveTo(xAt(x), ySpAt(y))
          startedBand = true
        } else {
          ctx.lineTo(xAt(x), ySpAt(y))
        }
      }
      for (let i = aggSp.newTime.length - 1; i >= 0; i -= 1) {
        const x = aggSp.newTime[i]
        const y = aggSp.p75[i]
        if (!Number.isFinite(y)) continue
        ctx.lineTo(xAt(x), ySpAt(y))
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(88,224,255,0.15)'
      ctx.fill()

      ctx.strokeStyle = '#58e0ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      let startedMean = false
      for (let i = 0; i < displaySpT.length; i += 1) {
        const y = displaySpY[i]
        if (!Number.isFinite(y)) continue
        if (!startedMean) {
          ctx.moveTo(xAt(displaySpT[i]), ySpAt(y))
          startedMean = true
        } else {
          ctx.lineTo(xAt(displaySpT[i]), ySpAt(y))
        }
      }
      ctx.stroke()

      if (tauSeries.length > 0) {
        const aggTau = aggregateSeries(tauSeries, rangeStart, rangeEnd, 1)
        displayTauT = aggTau.newTime
        displayTauY = aggTau.mean
      }
    }

    const [minTauY, maxTauY] = safeRange(displayTauY, [0, 1])
    const yTauAt = (v: number) => padTop + (1 - (v - minTauY) / Math.max(1e-9, maxTauY - minTauY)) * innerH

    // grid and axes over lines
    const xTicks = fixedXTicks ?? [0, 100, 200, 300, 400]
    const spTicks = fixedSpYTicks ?? buildTicks(fixedSpYMin, fixedSpYMax, 6)
    const tauTicks = buildTicks(minTauY, maxTauY, 6)

    ctx.strokeStyle = '#2a3a55'
    ctx.lineWidth = 1
    for (const xTick of xTicks) {
      const x = xAt(xTick)
      ctx.beginPath()
      ctx.moveTo(x, padTop)
      ctx.lineTo(x, padTop + innerH)
      ctx.stroke()
    }
    for (const yTick of spTicks) {
      const y = ySpAt(yTick)
      ctx.beginPath()
      ctx.moveTo(padLeft, y)
      ctx.lineTo(padLeft + innerW, y)
      ctx.stroke()
    }
    if (minTauY < 0 && maxTauY > 0) {
      const y0 = yTauAt(0)
      ctx.strokeStyle = 'rgba(255, 165, 180, 0.65)'
      ctx.beginPath()
      ctx.moveTo(padLeft, y0)
      ctx.lineTo(padLeft + innerW, y0)
      ctx.stroke()
    }

    ctx.strokeStyle = '#3f5775'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padLeft, padTop)
    ctx.lineTo(padLeft, padTop + innerH)
    ctx.lineTo(padLeft + innerW, padTop + innerH)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(padLeft + innerW, padTop)
    ctx.lineTo(padLeft + innerW, padTop + innerH)
    ctx.stroke()

    // redraw main lines above grid
    ctx.strokeStyle = '#58e0ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    drawStepSeries(ctx, displaySpT, displaySpY, xAt, ySpAt, rangeStart, rangeEnd)
    ctx.stroke()

    if (displayTauY.length > 0) {
      ctx.strokeStyle = '#ff83d1'
      ctx.lineWidth = 2
      ctx.beginPath()
      drawStepSeries(ctx, displayTauT, displayTauY, xAt, yTauAt, rangeStart, rangeEnd)
      ctx.stroke()
    }

    // peak guides
    let spPeakIdx = -1
    let spPeakVal = Number.NEGATIVE_INFINITY
    for (let i = 0; i < displaySpY.length; i += 1) {
      const v = displaySpY[i]
      if (!Number.isFinite(v)) continue
      if (v > spPeakVal) {
        spPeakVal = v
        spPeakIdx = i
      }
    }
    if (spPeakIdx >= 0) {
      const px = xAt(displaySpT[spPeakIdx])
      const py = ySpAt(displaySpY[spPeakIdx])
      ctx.strokeStyle = 'rgba(88, 224, 255, 0.65)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, padTop)
      ctx.lineTo(px, padTop + innerH)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(padLeft, py)
      ctx.lineTo(padLeft + innerW, py)
      ctx.stroke()
      ctx.fillStyle = '#58e0ff'
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    let tauPeakIdx = -1
    let tauPeakVal = Number.NEGATIVE_INFINITY
    for (let i = 0; i < displayTauY.length; i += 1) {
      const v = displayTauY[i]
      if (!Number.isFinite(v)) continue
      if (v > tauPeakVal) {
        tauPeakVal = v
        tauPeakIdx = i
      }
    }
    if (tauPeakIdx >= 0) {
      const px = xAt(displayTauT[tauPeakIdx])
      const py = yTauAt(displayTauY[tauPeakIdx])
      ctx.strokeStyle = 'rgba(255, 131, 209, 0.65)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, padTop)
      ctx.lineTo(px, padTop + innerH)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(padLeft, py)
      ctx.lineTo(padLeft + innerW, py)
      ctx.stroke()
      ctx.fillStyle = '#ff83d1'
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    if (Number.isFinite(launchMarkerMsAvg ?? Number.NaN)) {
      const lx = xAt(Math.max(rangeStart, Math.min(rangeEnd, launchMarkerMsAvg as number)))
      ctx.strokeStyle = 'rgba(130, 245, 188, 0.78)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(lx, padTop)
      ctx.lineTo(lx, padTop + innerH)
      ctx.stroke()
    }

    ctx.fillStyle = '#9cb4cc'
    ctx.font = '10px sans-serif'
    for (const xTick of xTicks) {
      ctx.fillText(String(Math.round(xTick)), xAt(xTick) - 8, padTop + innerH + 16)
    }
    for (const yTick of spTicks) {
      const value = Math.abs(yTick) < 1 ? yTick.toFixed(2) : yTick.toFixed(1)
      ctx.fillText(value, 8, ySpAt(yTick) + 3)
    }
    for (const yTick of tauTicks) {
      const value = Math.abs(yTick) < 1 ? yTick.toFixed(2) : yTick.toFixed(1)
      ctx.fillText(value, width - padRight + 6, yTauAt(yTick) + 3)
    }

    ctx.fillStyle = '#cfe4ff'
    ctx.font = '11px sans-serif'
    ctx.fillText(xLabel, width - 82, height - 10)

    ctx.save()
    ctx.translate(12, padTop + innerH / 2 + 22)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(spYLabel, 0, 0)
    ctx.restore()

    ctx.save()
    ctx.translate(width - 10, padTop + innerH / 2 + 22)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#ffd1ef'
    ctx.fillText(torqueYLabel, 0, 0)
    ctx.restore()
  }, [
    fixedSpYMax,
    fixedSpYMin,
    fixedSpYTicks,
    fixedXTicks,
    maxOverlay,
    mode,
    rangeEnd,
    rangeStart,
    shots,
    spYLabel,
    t,
    torqueYLabel,
    xLabel,
    launchMarkerMsAvg,
  ])

  return <canvas className="profile-canvas" ref={canvasRef} />
}
