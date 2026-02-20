import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { findPeakIndexRobust } from '../analysis/align'
import type { ShotProfile } from '../features/ble/bbpTypes'

interface ProfileChartProps {
  profile: ShotProfile | null
  peakIndex: number
  overlays?: (ShotProfile | null)[]
  mode?: 'raw' | 'normalized'
  timeMode?: 'start' | 'peak'
  yLabel?: string
  fixedXMaxMs?: number
  fixedYMax?: number
  fixedXTicks?: number[]
  fixedYTicks?: number[]
  drawZeroLine?: boolean
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

function buildTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (min === max) return [min]
  const ticks: number[] = []
  const step = (max - min) / Math.max(1, count - 1)
  for (let i = 0; i < count; i += 1) {
    ticks.push(min + step * i)
  }
  return ticks
}

export function ProfileChart({
  profile,
  peakIndex,
  overlays = [],
  mode = 'raw',
  timeMode = 'start',
  yLabel = 'SP',
  fixedXMaxMs,
  fixedYMax,
  fixedXTicks,
  fixedYTicks,
  drawZeroLine = false,
}: ProfileChartProps) {
  const { t } = useTranslation()
  const chart = useMemo(() => {
    const baseProfiles = overlays.filter((x): x is ShotProfile => Boolean(x && x.sp.length >= 2))
    const hasOverlay = baseProfiles.length > 0
    const chartProfiles = hasOverlay
      ? baseProfiles
      : profile && profile.sp.length >= 2
        ? [profile]
        : []

    if (chartProfiles.length === 0) return null

    const normalizedProfiles = chartProfiles.map((p) => {
      const displayT = toDisplayTimeMs(p, timeMode)
      const peak = Math.max(...p.sp)
      const sp = mode === 'normalized' ? p.sp.map((v) => v / Math.max(1, peak)) : p.sp
      return { tMs: displayT, sp }
    })

    return { hasOverlay, normalizedProfiles }
  }, [mode, overlays, profile, timeMode])

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

          const { hasOverlay, normalizedProfiles } = chart

          const padLeft = 54
          const padRight = 20
          const padTop = 16
          const padBottom = 38
          const innerW = width - padLeft - padRight
          const innerH = height - padTop - padBottom
          const fixedXAxes = !hasOverlay && fixedXMaxMs !== undefined
          const fixedYAxes = !hasOverlay && fixedYMax !== undefined
          const allT = normalizedProfiles.flatMap((p) => p.tMs)
          const allSp = normalizedProfiles.flatMap((p) => p.sp)
          const minT = fixedXAxes ? 0 : Math.min(...allT)
          const maxT = fixedXAxes ? (fixedXMaxMs as number) : Math.max(...allT)
          const minSp = fixedYAxes ? 0 : Math.min(...allSp)
          const maxSp = fixedYAxes ? (fixedYMax as number) : Math.max(...allSp)

          const xAt = (t: number) => padLeft + ((t - minT) / Math.max(1, maxT - minT)) * innerW
          const yAt = (sp: number) => padTop + (1 - (sp - minSp) / Math.max(1, maxSp - minSp)) * innerH

          const xTicks = fixedXTicks && fixedXTicks.length > 0
            ? fixedXTicks
            : buildTicks(minT, maxT, 6)
          const yTicks = fixedYTicks && fixedYTicks.length > 0
            ? fixedYTicks
            : buildTicks(minSp, maxSp, 6)

          ctx.strokeStyle = '#2a3a55'
          ctx.lineWidth = 1
          for (const x of xTicks) {
            const px = xAt(x)
            ctx.beginPath()
            ctx.moveTo(px, padTop)
            ctx.lineTo(px, padTop + innerH)
            ctx.stroke()
          }
          for (const y of yTicks) {
            const py = yAt(y)
            ctx.beginPath()
            ctx.moveTo(padLeft, py)
            ctx.lineTo(padLeft + innerW, py)
            ctx.stroke()
          }

          if (drawZeroLine && minSp < 0 && maxSp > 0) {
            const y0 = yAt(0)
            ctx.strokeStyle = 'rgba(255, 165, 180, 0.65)'
            ctx.lineWidth = 1.2
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

          normalizedProfiles.forEach((p, idx) => {
            ctx.strokeStyle = hasOverlay
              ? `rgba(88, 224, 255, ${Math.max(0.08, 0.35 - idx * 0.003)})`
              : '#58e0ff'
            ctx.lineWidth = hasOverlay ? 1 : 2
            ctx.beginPath()
            const t0 = fixedXAxes ? Math.max(0, Math.min(maxT, p.tMs[0])) : p.tMs[0]
            const s0 = fixedYAxes ? Math.max(0, Math.min(maxSp, p.sp[0])) : p.sp[0]
            ctx.moveTo(xAt(t0), yAt(s0))
            const step = p.sp.length > 96 ? 2 : 1
            for (let i = step; i < p.sp.length; i += step) {
              const tx = fixedXAxes ? Math.max(0, Math.min(maxT, p.tMs[i])) : p.tMs[i]
              const sy = fixedYAxes ? Math.max(0, Math.min(maxSp, p.sp[i])) : p.sp[i]
              if (fixedXAxes && p.tMs[i] > maxT) {
                break
              }
              if (fixedXAxes && p.tMs[i] < 0) {
                continue
              }
              ctx.lineTo(xAt(tx), yAt(sy))
            }
            ctx.stroke()
          })

          if (!hasOverlay && normalizedProfiles.length > 0) {
            const p = normalizedProfiles[0]
            const safePeakIndex = Math.min(Math.max(peakIndex, 0), p.sp.length - 1)
            const px = xAt(p.tMs[safePeakIndex])
            const py = yAt(p.sp[safePeakIndex])
            ctx.strokeStyle = '#d9483b88'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(px, padTop)
            ctx.lineTo(px, padTop + innerH)
            ctx.stroke()
            ctx.fillStyle = '#d9483b'
            ctx.beginPath()
            ctx.arc(px, py, 4, 0, Math.PI * 2)
            ctx.fill()

            const tVal = Math.round(p.tMs[safePeakIndex] ?? 0)
            const yVal = Number((p.sp[safePeakIndex] ?? 0).toFixed(3))
            canvas.title = `t=${tVal} ms, ${yLabel}=${yVal}`
          }

          ctx.fillStyle = '#9cb4cc'
          ctx.font = '10px sans-serif'
          xTicks.forEach((tick) => {
            const x = xAt(tick)
            ctx.fillText(String(Math.round(tick)), x - 8, padTop + innerH + 16)
          })
          yTicks.forEach((tick) => {
            const y = yAt(tick)
            const value = Math.abs(tick) < 1 ? tick.toFixed(2) : tick.toFixed(1)
            ctx.fillText(value, 8, y + 3)
          })

          ctx.fillStyle = '#cfe4ff'
          ctx.font = '11px sans-serif'
          ctx.fillText(t('labels.timeMs'), width - 82, height - 10)
          ctx.save()
          ctx.translate(10, padTop + innerH / 2 + 20)
          ctx.rotate(-Math.PI / 2)
          ctx.fillText(yLabel, 0, 0)
          ctx.restore()
        }}
      />
    </div>
  )
}
