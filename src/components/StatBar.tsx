interface StatBarProps {
  label: string
  value: number // 0-100
  color: string
}

export function StatBar({ label, value, color }: StatBarProps) {
  return (
    <div className="stat-bar">
      <span className="stat-bar-label">{label}</span>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}
