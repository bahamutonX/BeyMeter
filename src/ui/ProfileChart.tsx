import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { findPeakIndexRobust } from '../analysis/align'
import type { ShotProfile } from '../features/ble/bbpTypes'

interface ProfileChartProps {
  profile: ShotProfile | null
  peakIndex: number
  secondaryProfile?: ShotProfile | null
  secondaryPeakIndex?: number
  timeMode?: 'start' | 'peak'
  primaryYLabel?: string
  secondaryYLabel?: string
  fixedXMaxMs?: number
  fixedPrimaryYMax?: number
  fixedXTicks?: number[]
  fixedPrimaryYTicks?: number[]
}

function toDisplayTimeMs(profile: ShotProfile, timeMode: 'start' | 'peak'): number[] {
  if (profile.tMs.length === 0) return []
  if (timeMode === 'peak') {
    const idx = findPeakIndexRobust(profile.tMs, profile.sp, { minT: 80, useMAWindow: 3 })
    const t0 = profile.tMs[idx] ?? profile.tMs[0]
    return profile.tMs.map((t) => t - t0)
  }

  const idx0 = profile.profilePoints.findIndex((p) => p.nRefs > 0 && p.sp > 0)
  const t0 = idx0 >= 0 ? profile.profilePoints[idx0].tMs : profile.tMs[0]
  return profile.tMs.map((t) => t - t0)
}

function buildTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (min === max) return [min]
  const ticks: number[] = []
  const step = (max - min) / Math.max(1, count - 1)
  for (let i = 0; i < count; i += 1) {
    ticks.push(min + step * i)
  }
  return ticks
}

function niceUpperBound(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 100
  const rough = value * 1.12
  const exp = Math.floor(Math.log10(rough))
  const base = 10 ** exp
  const unit = rough / base
  let step = 1
  if (unit > 1) step = 2
  if (unit > 2) step = 5
  if (unit > 5) step = 10
  return step * base
}

function drawLineSeries(
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

  for (let i = 0; i < Math.min(tMs.length, y.length); i += 1) {
    const tx = tMs[i]
    const vy = y[i]
    if (!Number.isFinite(tx) || !Number.isFinite(vy)) continue
    if (tx < rangeStart) continue
    if (tx > rangeEnd) break
    const px = xAt(tx)
    const py = yAt(vy)
    if (!started) {
      ctx.moveTo(px, py)
      started = true
    } else {
      ctx.lineTo(px, py)
    }
  }
}

export function ProfileChart({
  profile,
  peakIndex,
  secondaryProfile = null,
  secondaryPeakIndex = 0,
  timeMode = 'start',
  primaryYLabel = 'SP',
  secondaryYLabel = 'Input',
  fixedXMaxMs,
  fixedPrimaryYMax,
  fixedXTicks,
  fixedPrimaryYTicks,
}: ProfileChartProps) {
  const { t } = useTranslation()
  const chart = useMemo(() => {
    if (!profile || profile.sp.length < 2) return null

    const primary = {
      tMs: toDisplayTimeMs(profile, timeMode),
      y: profile.sp,
    }

    const secondary = secondaryProfile && secondaryProfile.sp.length >= 2
      ? {
          tMs: toDisplayTimeMs(secondaryProfile, timeMode),
          y: secondaryProfile.sp,
        }
      : null

    return { primary, secondary }
  }, [profile, secondaryProfile, timeMode])

  return (
    <div className="chart-wrap">
      <canvas
        className="profile-canvas"
        ref={(canvas) => {
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

          if (!chart) {
            ctx.fillStyle = '#8fa7bf'
            ctx.font = '12px sans-serif'
            ctx.fillText(t('chart.insufficientWaveform'), 12, 20)
            return
          }

          const padLeft = 62
          const padRight = 56
          const padTop = 16
          const padBottom = 38
          const innerW = width - padLeft - padRight
          const innerH = height - padTop - padBottom

          const allT = [
            ...chart.primary.tMs,
            ...(chart.secondary?.tMs ?? []),
          ]
          const minT = 0
          const maxT = fixedXMaxMs ?? Math.max(...allT)

          const minPrimaryY = 0
          const maxPrimaryY = fixedPrimaryYMax ?? Math.max(...chart.primary.y)

          const secondaryValues = (chart.secondary?.y ?? []).filter(
            (v): v is number => Number.isFinite(v),
          )
          const secondaryMax = secondaryValues.length > 0 ? Math.max(...secondaryValues) : 100
          const minSecondaryY = 0
          const maxSecondaryY = niceUpperBound(secondaryMax)

          const xAt = (tVal: number) => padLeft + ((tVal - minT) / Math.max(1, maxT - minT)) * innerW
          const yPrimaryAt = (v: number) => padTop + (1 - (v - minPrimaryY) / Math.max(1, maxPrimaryY - minPrimaryY)) * innerH
          const ySecondaryAt = (v: number) => padTop + (1 - (v - minSecondaryY) / Math.max(1e-9, maxSecondaryY - minSecondaryY)) * innerH

          const xTicks = fixedXTicks && fixedXTicks.length > 0
            ? fixedXTicks
            : buildTicks(minT, maxT, 6)
          const primaryYTicks = fixedPrimaryYTicks && fixedPrimaryYTicks.length > 0
            ? fixedPrimaryYTicks
            : buildTicks(minPrimaryY, maxPrimaryY, 6)
          const secondaryYTicks = buildTicks(minSecondaryY, maxSecondaryY, 6)

          ctx.strokeStyle = '#2a3a55'
          ctx.lineWidth = 1
          for (const x of xTicks) {
            const px = xAt(x)
            ctx.beginPath()
            ctx.moveTo(px, padTop)
            ctx.lineTo(px, padTop + innerH)
            ctx.stroke()
          }
          for (const y of primaryYTicks) {
            const py = yPrimaryAt(y)
            ctx.beginPath()
            ctx.moveTo(padLeft, py)
            ctx.lineTo(padLeft + innerW, py)
            ctx.stroke()
          }

          if (minSecondaryY < 0 && maxSecondaryY > 0) {
            const y0 = ySecondaryAt(0)
            ctx.strokeStyle = 'rgba(255, 165, 180, 0.65)'
            ctx.lineWidth = 1
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

          ctx.strokeStyle = '#58e0ff'
          ctx.lineWidth = 2
          ctx.beginPath()
          const clampedPrimaryY = chart.primary.y.map((v) => Math.max(minPrimaryY, Math.min(maxPrimaryY, v)))
          drawLineSeries(ctx, chart.primary.tMs, clampedPrimaryY, xAt, yPrimaryAt, 0, maxT)
          ctx.stroke()

          if (chart.secondary) {
            ctx.strokeStyle = '#ff83d1'
            ctx.lineWidth = 2
            ctx.beginPath()
            drawLineSeries(ctx, chart.secondary.tMs, chart.secondary.y, xAt, ySecondaryAt, 0, maxT)
            ctx.stroke()
          }

          const safePrimaryPeakIndex = Math.min(Math.max(peakIndex, 0), chart.primary.y.length - 1)
          const primaryPeakX = xAt(chart.primary.tMs[safePrimaryPeakIndex] ?? 0)
          const primaryPeakY = yPrimaryAt(chart.primary.y[safePrimaryPeakIndex] ?? 0)

          ctx.strokeStyle = 'rgba(88, 224, 255, 0.65)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(primaryPeakX, padTop)
          ctx.lineTo(primaryPeakX, padTop + innerH)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(padLeft, primaryPeakY)
          ctx.lineTo(padLeft + innerW, primaryPeakY)
          ctx.stroke()
          ctx.fillStyle = '#58e0ff'
          ctx.beginPath()
          ctx.arc(primaryPeakX, primaryPeakY, 4, 0, Math.PI * 2)
          ctx.fill()

          if (chart.secondary && chart.secondary.y.length > 0) {
            const safeSecondaryPeakIndex = Math.min(Math.max(secondaryPeakIndex, 0), chart.secondary.y.length - 1)
            const secondaryPeakX = xAt(chart.secondary.tMs[safeSecondaryPeakIndex] ?? 0)
            const secondaryPeakY = ySecondaryAt(chart.secondary.y[safeSecondaryPeakIndex] ?? 0)

            ctx.strokeStyle = 'rgba(255, 131, 209, 0.65)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(secondaryPeakX, padTop)
            ctx.lineTo(secondaryPeakX, padTop + innerH)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(padLeft, secondaryPeakY)
            ctx.lineTo(padLeft + innerW, secondaryPeakY)
            ctx.stroke()
            ctx.fillStyle = '#ff83d1'
            ctx.beginPath()
            ctx.arc(secondaryPeakX, secondaryPeakY, 4, 0, Math.PI * 2)
            ctx.fill()
          }

          ctx.fillStyle = '#9cb4cc'
          ctx.font = '10px sans-serif'
          xTicks.forEach((tick) => {
            const x = xAt(tick)
            ctx.fillText(String(Math.round(tick)), x - 8, padTop + innerH + 16)
          })
          ctx.textAlign = 'right'
          primaryYTicks.forEach((tick) => {
            const y = yPrimaryAt(tick)
            const value = String(Math.round(tick))
            ctx.fillText(value, padLeft - 6, y + 3)
          })
          ctx.textAlign = 'left'
          secondaryYTicks.forEach((tick) => {
            const y = ySecondaryAt(tick)
            const value = String(Math.round(tick))
            ctx.fillText(value, width - padRight + 6, y + 3)
          })

          ctx.fillStyle = '#cfe4ff'
          ctx.font = '11px sans-serif'
          ctx.fillText(t('labels.timeMs'), width - 82, height - 10)

          ctx.save()
          ctx.translate(12, padTop + innerH / 2 + 22)
          ctx.rotate(-Math.PI / 2)
          ctx.fillText(primaryYLabel, 0, 0)
          ctx.restore()

          ctx.save()
          ctx.translate(width - 10, padTop + innerH / 2 + 22)
          ctx.rotate(-Math.PI / 2)
          ctx.fillStyle = '#ffd1ef'
          ctx.fillText(secondaryYLabel, 0, 0)
          ctx.restore()
        }}
      />
    </div>
  )
}
