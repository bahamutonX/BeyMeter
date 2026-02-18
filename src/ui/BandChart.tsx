import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { PersistentShot } from '../features/meter/shotStorage'
import { aggregateSeries } from '../analysis/aggregateSeries'
import { alignTime, findPeakIndexRobust, type AlignmentMode } from '../analysis/align'

export type BandChartMode = 'avg' | 'overlay' | 'dist' | 'feature' | 'torque'
export type SeriesTarget = 'sp' | 'tau'

interface BandChartProps {
  shots: PersistentShot[]
  mode: BandChartMode
  seriesTarget?: SeriesTarget
  alignment?: AlignmentMode
  normalize?: boolean
  rangeStart?: number
  rangeEnd?: number
  fixedYMin?: number
  fixedYMax?: number
  fixedXTicks?: number[]
  fixedYTicks?: number[]
  xLabel?: string
  yLabel?: string
  maxOverlay?: number
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  padLeft: number,
  padTop: number,
  padRight: number,
  padBottom: number,
  w: number,
  h: number,
) {
  ctx.strokeStyle = '#3f5775'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padLeft, padTop)
  ctx.lineTo(padLeft, h - padBottom)
  ctx.lineTo(w - padRight, h - padBottom)
  ctx.stroke()
}

function safeRange(values: number[], fallback = [0, 1]): [number, number] {
  const valid = values.filter((v) => Number.isFinite(v))
  if (valid.length === 0) return [fallback[0], fallback[1]]
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  if (min === max) return [min - 1, max + 1]
  return [min, max]
}

function prepSeries(
  shots: PersistentShot[],
  seriesTarget: SeriesTarget,
  alignment: AlignmentMode,
  normalize: boolean,
): Array<{ t: number[]; y: number[] }> {
  return shots
    .map((shot) => {
      const source =
        seriesTarget === 'sp'
          ? shot.profile
            ? { tMs: shot.profile.tMs, y: shot.profile.sp }
            : null
          : shot.torqueSeries
            ? { tMs: shot.torqueSeries.tMs, y: shot.torqueSeries.tau }
            : null
      if (!source || source.tMs.length < 2 || source.y.length < 2) {
        return null
      }

      const aligned =
        alignment === 'start'
          ? source.tMs.map((t) => t - source.tMs[0])
          : alignTime(source.tMs, source.y, {
              mode: alignment,
              peakOptions: { minT: 80, useMAWindow: 3 },
            })

      const peakIdx = findPeakIndexRobust(source.tMs, source.y, { minT: 80, useMAWindow: 3 })
      const peakVal = Math.max(Math.abs(source.y[peakIdx] ?? 0), 1e-9)
      const y = normalize ? source.y.map((v) => v / peakVal) : source.y
      return { t: aligned, y }
    })
    .filter((x): x is { t: number[]; y: number[] } => x !== null)
}

export function BandChart({
  shots,
  mode,
  seriesTarget = 'sp',
  alignment = 'peak',
  normalize = true,
  rangeStart = -400,
  rangeEnd = 1000,
  fixedYMin,
  fixedYMax,
  fixedXTicks,
  fixedYTicks,
  xLabel = 'Time (ms)',
  yLabel = 'Value',
  maxOverlay = 20,
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

    const validShots = shots.filter((s) => s.profile && s.profile.sp.length >= 2)
    if (validShots.length === 0) {
      ctx.fillStyle = '#8fa7bf'
      ctx.font = '12px sans-serif'
      ctx.fillText(t('chart.insufficientBandData'), 12, 20)
      return
    }

    const padLeft = 54
    const padRight = 20
    const padTop = 16
    const padBottom = 38
    drawAxes(ctx, padLeft, padTop, padRight, padBottom, width, height)

    if (mode === 'dist') {
      const scores = validShots.map((s) => s.estSp)
      const min = Math.min(...scores)
      const max = Math.max(...scores)
      const bins = 10
      const step = Math.max(1, Math.ceil((max - min + 1) / bins))
      const counts = new Array(bins).fill(0)
      for (const s of scores) {
        const idx = Math.min(bins - 1, Math.floor((s - min) / step))
        counts[idx] += 1
      }
      const maxCount = Math.max(...counts, 1)
      const barW = (width - padLeft - padRight) / bins
      for (let i = 0; i < bins; i += 1) {
        const h = ((height - padTop - padBottom) * counts[i]) / maxCount
        ctx.fillStyle = '#58e0ff'
        ctx.fillRect(padLeft + i * barW + 2, height - padBottom - h, barW - 4, h)
      }
      return
    }

    if (mode === 'feature') {
      const xs = validShots.map((s) => s.features.t_peak)
      const ys = validShots.map((s) => s.features.slope_max)
      const [minX, maxX] = safeRange(xs, [0, 1000])
      const [minY, maxY] = safeRange(ys, [0, 1])
      const xAt = (x: number) => padLeft + ((x - minX) / Math.max(1e-9, maxX - minX)) * (width - padLeft - padRight)
      const yAt = (y: number) => padTop + (1 - (y - minY) / Math.max(1e-9, maxY - minY)) * (height - padTop - padBottom)
      ctx.fillStyle = '#58e0ff'
      for (let i = 0; i < xs.length; i += 1) {
        ctx.beginPath()
        ctx.arc(xAt(xs[i]), yAt(ys[i]), 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }

    const series = prepSeries(validShots, seriesTarget, alignment, normalize)
    if (series.length === 0) {
      ctx.fillStyle = '#8fa7bf'
      ctx.font = '12px sans-serif'
      ctx.fillText(t('chart.insufficientSeries'), 12, 20)
      return
    }

    const xAt = (t: number) => padLeft + ((t - rangeStart) / Math.max(1, rangeEnd - rangeStart)) * (width - padLeft - padRight)
    const drawGridAndTicks = (yAt: (v: number) => number) => {
      const xTicks = fixedXTicks ?? [rangeStart, (rangeStart + rangeEnd) * 0.5, rangeEnd]
      const yTicks = fixedYTicks ?? []
      ctx.strokeStyle = '#2a3a55'
      ctx.lineWidth = 1
      for (const x of xTicks) {
        const px = xAt(x)
        ctx.beginPath()
        ctx.moveTo(px, padTop)
        ctx.lineTo(px, height - padBottom)
        ctx.stroke()
      }
      for (const y of yTicks) {
        const py = yAt(y)
        ctx.beginPath()
        ctx.moveTo(padLeft, py)
        ctx.lineTo(width - padRight, py)
        ctx.stroke()
      }
      ctx.fillStyle = '#9cb4cc'
      ctx.font = '10px sans-serif'
      for (const x of xTicks) {
        ctx.fillText(String(Math.round(x)), xAt(x) - 8, height - padBottom + 16)
      }
      for (const y of yTicks) {
        ctx.fillText(String(Math.round(y)), 14, yAt(y) + 3)
      }
      ctx.fillStyle = '#cfe4ff'
      ctx.font = '11px sans-serif'
      ctx.fillText(xLabel, width - 82, height - 10)
      ctx.save()
      ctx.translate(10, padTop + (height - padTop - padBottom) / 2 + 20)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(yLabel, 0, 0)
      ctx.restore()
    }

    if (mode === 'overlay') {
      const sampled = series.slice(0, Math.min(maxOverlay, series.length))
      const allY = sampled.flatMap((s) => s.y)
      const [autoMinY, autoMaxY] = safeRange(allY, normalize ? [0, 1] : [-1, 1])
      const minY = fixedYMin ?? autoMinY
      const maxY = fixedYMax ?? autoMaxY
      const yAt = (v: number) => padTop + (1 - (v - minY) / Math.max(1e-9, maxY - minY)) * (height - padTop - padBottom)
      if (fixedYMin !== undefined && fixedYMax !== undefined) {
        drawGridAndTicks(yAt)
      }
      sampled.forEach((s, idx) => {
        ctx.strokeStyle = `rgba(88,224,255,${Math.max(0.08, 0.32 - idx * 0.01)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(xAt(s.t[0]), yAt(s.y[0]))
        for (let i = 1; i < s.t.length; i += 1) {
          if (s.t[i] < rangeStart || s.t[i] > rangeEnd) continue
          ctx.lineTo(xAt(s.t[i]), yAt(s.y[i]))
        }
        ctx.stroke()
      })
      return
    }

    const agg = aggregateSeries(series, rangeStart, rangeEnd, 10)
    const yValues = [...agg.mean, ...agg.p25, ...agg.p75].filter((v) => Number.isFinite(v)) as number[]
    const [autoMinY, autoMaxY] = safeRange(yValues, normalize ? [0, 1] : [-1, 1])
    const minY = fixedYMin ?? autoMinY
    const maxY = fixedYMax ?? autoMaxY
    const yAt = (v: number) => padTop + (1 - (v - minY) / Math.max(1e-9, maxY - minY)) * (height - padTop - padBottom)
    if (fixedYMin !== undefined && fixedYMax !== undefined) {
      drawGridAndTicks(yAt)
    }

    ctx.strokeStyle = 'rgba(88,224,255,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    let started = false
    for (let i = 0; i < agg.newTime.length; i += 1) {
      const x = agg.newTime[i]
      const y = agg.p25[i]
      if (!Number.isFinite(y)) continue
      if (!started) {
        ctx.moveTo(xAt(x), yAt(y))
        started = true
      } else {
        ctx.lineTo(xAt(x), yAt(y))
      }
    }
    for (let i = agg.newTime.length - 1; i >= 0; i -= 1) {
      const x = agg.newTime[i]
      const y = agg.p75[i]
      if (!Number.isFinite(y)) continue
      ctx.lineTo(xAt(x), yAt(y))
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(88,224,255,0.15)'
    ctx.fill()

    ctx.strokeStyle = '#58e0ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    let mStarted = false
    for (let i = 0; i < agg.newTime.length; i += 1) {
      const x = agg.newTime[i]
      const y = agg.mean[i]
      if (!Number.isFinite(y)) continue
      if (!mStarted) {
        ctx.moveTo(xAt(x), yAt(y))
        mStarted = true
      } else {
        ctx.lineTo(xAt(x), yAt(y))
      }
    }
    ctx.stroke()
  }, [
    alignment,
    fixedXTicks,
    fixedYMax,
    fixedYMin,
    fixedYTicks,
    maxOverlay,
    mode,
    normalize,
    rangeEnd,
    rangeStart,
    seriesTarget,
    shots,
    t,
    xLabel,
    yLabel,
  ])

  return <canvas className="profile-canvas" ref={canvasRef} />
}
