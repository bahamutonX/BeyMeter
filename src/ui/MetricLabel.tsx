import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MetricHelp } from './metricLabels'

export function MetricLabel({ help }: { help: MetricHelp }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    function onDown(ev: MouseEvent | TouchEvent) {
      const root = rootRef.current
      if (!root) return
      const target = ev.target as Node
      if (!root.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [])

  return (
    <span className={`metric-label ${open ? 'open' : ''}`} ref={rootRef}>
      <span>{t(help.labelKey)}</span>
      <button
        className="metric-info-btn"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label={t('common.metricInfoAria', { label: t(help.labelKey) })}
      >
        ⓘ
      </button>
      <span className="metric-tooltip" role="tooltip">
        {help.lineKeys.map((lineKey) => (
          <span key={lineKey}>{t(lineKey)}</span>
        ))}
      </span>
    </span>
  )
}
