const PROJECT_OVERVIEW_COLUMN_WIDTHS = {
  participants: ["23%", "11%", "17%", "19%", "13%", "9%", "8%"],
  documents: ["34%", "15%", "20%", "15%", "8%", "8%"],
  letters: ["14%", "25%", "11%", "19%", "13%", "10%", "8%"],
} as const

export type ProjectOverviewTableLayout = keyof typeof PROJECT_OVERVIEW_COLUMN_WIDTHS

export const projectOverviewTableCellClass = {
  headerFirst: "py-3 ps-5 pe-3 text-start sm:ps-6",
  headerMiddle: "px-3 py-3 text-start",
  headerLast: "py-3 ps-3 pe-5 text-end sm:pe-6",
  bodyFirst: "py-3.5 ps-5 pe-3 sm:ps-6",
  bodyMiddle: "px-3 py-3.5",
  bodyLast: "py-3.5 ps-3 pe-5 text-end sm:pe-6",
} as const

export function ProjectOverviewTableColumns({ layout }: { layout: ProjectOverviewTableLayout }) {
  return (
    <colgroup>
      {PROJECT_OVERVIEW_COLUMN_WIDTHS[layout].map((width, index) => (
        <col key={`${layout}-${width}-${index}`} style={{ width }} />
      ))}
    </colgroup>
  )
}
