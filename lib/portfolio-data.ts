// Portfolio-level dashboard mock data ("Overview of all projects").

export type Trend = { direction: "up" | "down"; value: number; good: boolean }

export type PortfolioKpi = {
  key: string
  label: string
  value: number
  tone: "blue" | "red" | "amber" | "green"
  icon: "projects" | "ncr" | "inspection" | "rfi"
  caption?: string
  trend?: Trend
  spark: number[]
}

export const portfolioKpis: PortfolioKpi[] = [
  {
    key: "projects",
    label: "Total Projects",
    value: 12,
    tone: "blue",
    icon: "projects",
    caption: "Active projects",
    spark: [4, 6, 5, 7, 6, 8, 7, 9, 8, 10, 11, 12],
  },
  {
    key: "ncrs",
    label: "Open NCRs",
    value: 32,
    tone: "red",
    icon: "ncr",
    trend: { direction: "up", value: 12, good: false },
    spark: [10, 14, 12, 18, 16, 22, 20, 26, 24, 28, 30, 32],
  },
  {
    key: "inspections",
    label: "Open Inspections",
    value: 18,
    tone: "amber",
    icon: "inspection",
    trend: { direction: "down", value: 4, good: true },
    spark: [26, 24, 25, 22, 23, 21, 20, 19, 21, 19, 18, 18],
  },
  {
    key: "rfis",
    label: "Open RFIs",
    value: 27,
    tone: "green",
    icon: "rfi",
    trend: { direction: "up", value: 7, good: true },
    spark: [12, 14, 13, 16, 15, 18, 20, 19, 22, 24, 25, 27],
  },
]

export type StatusSlice = { label: string; value: number; color: string }

export const ncrStatusSlices: StatusSlice[] = [
  { label: "Open", value: 12, color: "var(--chart-3)" },
  { label: "In Progress", value: 8, color: "var(--chart-4)" },
  { label: "Pending", value: 6, color: "var(--warning)" },
  { label: "Closed", value: 4, color: "var(--chart-2)" },
  { label: "Rejected", value: 2, color: "var(--chart-5)" },
]

export const inspectionStatusSlices: StatusSlice[] = [
  { label: "Open", value: 7, color: "var(--chart-1)" },
  { label: "In Progress", value: 5, color: "var(--chart-2)" },
  { label: "Pending", value: 3, color: "var(--warning)" },
  { label: "Closed", value: 3, color: "oklch(0.7 0.1 190)" },
]

export type PortfolioActivity = {
  id: string
  type: "ncr" | "inspection" | "rfi" | "vo" | "document"
  title: string
  reference?: string
  project: string
  time: string
}

export const portfolioActivity: PortfolioActivity[] = [
  { id: "1", type: "ncr", title: "created", reference: "NCR-1021", project: "Sunset Residential Tower", time: "10m ago" },
  {
    id: "2",
    type: "inspection",
    title: "completed",
    reference: "INSP-2048",
    project: "Greenfield Office Complex",
    time: "1h ago",
  },
  { id: "3", type: "rfi", title: "answered", reference: "RFI-3095", project: "Harbor View Hotel", time: "2h ago" },
  { id: "4", type: "vo", title: "approved", reference: "VO-105", project: "City Center Mall", time: "3h ago" },
  { id: "5", type: "document", title: "Letter uploaded", project: "Airport Road Bridge", time: "5h ago" },
]

export type ProjectRole = "Consultant" | "Contractor" | "Client"

export type PortfolioProject = {
  id: string
  name: string
  role: ProjectRole
  ncrs: number
  inspections: number
  rfis: number
  vos: number
  progress: number
}

export const portfolioProjects: PortfolioProject[] = [
  { id: "1", name: "Sunset Residential Tower", role: "Consultant", ncrs: 8, inspections: 4, rfis: 6, vos: 2, progress: 62 },
  { id: "2", name: "Greenfield Office Complex", role: "Consultant", ncrs: 5, inspections: 3, rfis: 4, vos: 1, progress: 45 },
  { id: "3", name: "Harbor View Hotel", role: "Contractor", ncrs: 6, inspections: 3, rfis: 5, vos: 2, progress: 58 },
  { id: "4", name: "City Center Mall", role: "Consultant", ncrs: 4, inspections: 2, rfis: 3, vos: 2, progress: 71 },
  { id: "5", name: "Airport Road Bridge", role: "Client", ncrs: 3, inspections: 2, rfis: 2, vos: 1, progress: 35 },
]

export type TaskType = "NCR" | "Inspection" | "RFI" | "VO"

export type PortfolioTask = {
  id: string
  action: string
  type: TaskType
  reference: string
  project: string
  due: string
  dueTone: "danger" | "warning" | "muted"
}

export const portfolioTasks: PortfolioTask[] = [
  {
    id: "1",
    action: "Review NCR",
    type: "NCR",
    reference: "NCR-1020",
    project: "Sunset Residential Tower",
    due: "Due today",
    dueTone: "danger",
  },
  {
    id: "2",
    action: "Inspection",
    type: "Inspection",
    reference: "INSP-2049",
    project: "Greenfield Office Complex",
    due: "Due tomorrow",
    dueTone: "warning",
  },
  {
    id: "3",
    action: "Answer RFI",
    type: "RFI",
    reference: "RFI-3096",
    project: "Harbor View Hotel",
    due: "May 20",
    dueTone: "muted",
  },
  {
    id: "4",
    action: "Approve VO",
    type: "VO",
    reference: "VO-107",
    project: "City Center Mall",
    due: "May 22",
    dueTone: "muted",
  },
]

export const dashboardDateRange = "May 12 – May 18, 2024"
