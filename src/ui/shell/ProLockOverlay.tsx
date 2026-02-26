interface ProLockOverlayProps {
  title: string
  description: string
  unlockCta: string
  cancelLabel: string
  onUnlock: () => void
  onCancel: () => void
}

export function ProLockOverlay({
  title,
  description,
  unlockCta,
  cancelLabel,
  onUnlock,
  onCancel,
}: ProLockOverlayProps) {
  return (
    <div className="pro-overlay">
      <div className="pro-overlay-card">
        <h4>{title}</h4>
        <p>{description}</p>
        <div className="desktop-pro-actions">
          <button type="button" className="mini-btn subtle" onClick={onUnlock}>
            {unlockCta}
          </button>
          <button type="button" className="mini-btn subtle" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

