const PROJECT_OVERVIEW_COLUMN_WIDTHS = ["18%", "18%", "14%", "20%", "12%", "10%", "8%"] as const

export function ProjectOverviewTableColumns() {
  return (
    <colgroup>
      {PROJECT_OVERVIEW_COLUMN_WIDTHS.map((width, index) => (
        <col key={`${width}-${index}`} style={{ width }} />
      ))}
    </colgroup>
  )
}
