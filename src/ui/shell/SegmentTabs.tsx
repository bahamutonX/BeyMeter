import type { ReactNode } from 'react'

export interface SegmentTabItem {
  key: string
  title: string
  icon?: ReactNode
  ariaLabel?: string
}

interface SegmentTabsProps {
  items: SegmentTabItem[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
  buttonClassName: string
  ariaLabel: string
}

export function SegmentTabs({
  items,
  activeKey,
  onChange,
  className = '',
  buttonClassName,
  ariaLabel,
}: SegmentTabsProps) {
  return (
    <div className={className} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={activeKey === item.key}
          aria-label={item.ariaLabel}
          className={`${buttonClassName} ${activeKey === item.key ? 'active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          {item.icon ?? null}
          <span className="segment-tab-title">{item.title}</span>
        </button>
      ))}
    </div>
  )
}

