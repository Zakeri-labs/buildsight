type Segment = { value: number; color: string }

export function DonutChart({
  segments,
  total,
  size = 160,
  strokeWidth = 16,
  centerTop,
  centerBottom,
}: {
  segments: Segment[]
  total?: number
  size?: number
  strokeWidth?: number
  centerTop?: React.ReactNode
  centerBottom?: React.ReactNode
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const sum = total ?? segments.reduce((acc, s) => acc + s.value, 0)
  const center = size / 2

  let cumulative = 0

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg, i) => {
          const fraction = sum > 0 ? seg.value / sum : 0
          const length = fraction * circumference
          const offset = -(cumulative / sum) * circumference
          cumulative += seg.value
          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {centerTop}
        {centerBottom}
      </div>
    </div>
  )
}
