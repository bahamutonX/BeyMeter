import type { ReactNode } from 'react'

export function NeonPanel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`panel neon-panel ${className}`.trim()}>{children}</div>
}
