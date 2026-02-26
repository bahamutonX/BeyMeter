interface MeterGaugeProps {
  value: number
  best: number
  maxRpm: number
  bestLabel: string
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function MeterGauge({ value, best, maxRpm, bestLabel }: MeterGaugeProps) {
  const width = 420
  const height = 250
  const cx = width / 2
  const cy = height - 26
  const radius = 170

  const pct = clamp(value / maxRpm, 0, 1)
  const bestPct = clamp(best / maxRpm, 0, 1)

  const angleFromPct = (p: number) => Math.PI - p * Math.PI
  const needleA = angleFromPct(pct)
  const markerA = angleFromPct(bestPct)

  const arcStartX = cx - radius
  const arcStartY = cy
  const arcEndX = cx + radius
  const arcEndY = cy

  const needleX = cx + Math.cos(needleA) * (radius - 30)
  const needleY = cy - Math.sin(needleA) * (radius - 30)

  const markerBaseX = cx + Math.cos(markerA) * (radius + 3)
  const markerBaseY = cy - Math.sin(markerA) * (radius + 3)
  const markerLeftX = markerBaseX + Math.cos(markerA + Math.PI / 2) * 5
  const markerLeftY = markerBaseY - Math.sin(markerA + Math.PI / 2) * 5
  const markerRightX = markerBaseX + Math.cos(markerA - Math.PI / 2) * 5
  const markerRightY = markerBaseY - Math.sin(markerA - Math.PI / 2) * 5
  const markerTipX = cx + Math.cos(markerA) * (radius - 8)
  const markerTipY = cy - Math.sin(markerA) * (radius - 8)
  const markerLabelRawX = cx + Math.cos(markerA) * (radius + 36)
  const markerLabelX = clamp(markerLabelRawX, 18, width - 18)
  const markerLabelY = cy - Math.sin(markerA) * (radius + 36)

  const ticks = Array.from({ length: Math.floor(maxRpm / 1000) + 1 }, (_, i) => i * 1000)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="meter-gauge" role="img" aria-label="Shot Power Meter">
      <path
        d={`M ${arcStartX} ${arcStartY} A ${radius} ${radius} 0 0 1 ${arcEndX} ${arcEndY}`}
        stroke="rgba(90, 165, 220, 0.35)"
        strokeWidth="18"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M ${arcStartX} ${arcStartY} A ${radius} ${radius} 0 0 1 ${arcEndX} ${arcEndY}`}
        stroke="url(#meterGradient)"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="meterGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4fc3ff" />
          <stop offset="60%" stopColor="#58e0ff" />
          <stop offset="100%" stopColor="#ff83d1" />
        </linearGradient>
      </defs>
      <polygon
        points={`${markerLeftX},${markerLeftY} ${markerRightX},${markerRightY} ${markerTipX},${markerTipY}`}
        fill="#ffd972"
        opacity="0.95"
      />
      <text x={markerLabelX} y={markerLabelY} className="meter-gauge-max-label" textAnchor="middle" dominantBaseline="central">
        MAX
      </text>
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#f3fbff" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="9" fill="#dff7ff" />

      {ticks.map((tick) => {
        const a = angleFromPct(tick / maxRpm)
        const outer = radius + 2
        const inner = radius - (tick % 2000 === 0 ? 18 : 12)
        const tx = cx + Math.cos(a) * (radius - 34)
        const ty = cy - Math.sin(a) * (radius - 34)
        return (
          <g key={tick}>
            <line
              x1={cx + Math.cos(a) * outer}
              y1={cy - Math.sin(a) * outer}
              x2={cx + Math.cos(a) * inner}
              y2={cy - Math.sin(a) * inner}
              stroke="rgba(186, 219, 241, 0.75)"
              strokeWidth={tick % 2000 === 0 ? 2 : 1}
            />
            {tick % 2000 === 0 ? (
              <text x={tx} y={ty} className="meter-gauge-label" textAnchor="middle" dominantBaseline="central">
                {tick}
              </text>
            ) : null}
          </g>
        )
      })}

      <text x={cx} y={cy - 62} className="meter-gauge-value" textAnchor="middle">
        {Math.round(clamp(value, 0, maxRpm))}
        <tspan className="meter-gauge-unit"> rpm</tspan>
      </text>
      <text x={cx} y={cy - 34} className="meter-gauge-best" textAnchor="middle">
        {bestLabel} {Math.round(clamp(best, 0, maxRpm))} rpm
      </text>
    </svg>
  )
}
