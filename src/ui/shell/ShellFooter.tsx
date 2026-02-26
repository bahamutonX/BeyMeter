import type { ReactNode } from 'react'

export interface FooterDotItem {
  key: string
  label: number
}

interface ShellFooterProps {
  className: string
  dotsClassName: string
  dotClassName: string
  creditClassName: string
  items: FooterDotItem[]
  activeKey: string
  onSelect: (key: string) => void
  credit: ReactNode
  pageMoveLabel: (page: number) => string
}

export function ShellFooter({
  className,
  dotsClassName,
  dotClassName,
  creditClassName,
  items,
  activeKey,
  onSelect,
  credit,
  pageMoveLabel,
}: ShellFooterProps) {
  return (
    <footer className={className}>
      <div className={dotsClassName} aria-label="Page indicator">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${dotClassName} ${activeKey === item.key ? 'active' : ''}`}
            onClick={() => onSelect(item.key)}
            aria-label={pageMoveLabel(item.label)}
          >
            <span className="dot-core" />
          </button>
        ))}
      </div>
      <div className={creditClassName}>{credit}</div>
    </footer>
  )
}

