export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className="segmented neon-segmented" role="tablist" aria-label="toggle">
      {options.map((opt) => (
        <button
          className={`seg-btn ${value === opt.value ? 'active' : ''}`}
          key={opt.value}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
