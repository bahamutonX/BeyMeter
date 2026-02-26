export function SectionHeader({
  en,
  title,
  description,
}: {
  en: string
  title: string
  description: string
}) {
  return (
    <header className="section-header">
      <div className="section-en">{en}</div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  )
}
