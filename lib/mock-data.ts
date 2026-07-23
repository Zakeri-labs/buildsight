export type Discipline = "Structural" | "MEP" | "Architectural" | "Civil" | "Electrical" | "Mechanical"
export type Priority = "high" | "medium" | "low"
export type InspectionStatus = "pending" | "approved" | "rejected" | "in-progress"

export const currentUser = {
  name: "Omar Hassan",
  role: "projectManager" as const,
  initials: "OH",
  email: "omar.hassan@buildsight.com",
}

export const activeProject = {
  id: "PRJ-001",
  name: "Al Noor Residential Tower",
  location: "Dubai, UAE",
  image: "/projects/al-noor-tower.png",
  status: "underConstruction" as const,
  contractor: "Atlas Contracting",
  consultant: "BuildSight Consulting",
  targetHandover: "18 Dec 2026",
  progress: { planned: 72, actual: 68, delay: 4 },
}

export const projectsList = [
  activeProject,
  {
    id: "PRJ-002",
    name: "Marina Bay Offices",
    location: "Abu Dhabi, UAE",
    image: "/site/facade-installation.png",
    status: "underConstruction" as const,
    contractor: "Gulf Builders",
    consultant: "BuildSight Consulting",
    targetHandover: "30 Jun 2026",
    progress: { planned: 45, actual: 41, delay: 4 },
  },
  {
    id: "PRJ-003",
    name: "Green Valley Villas",
    location: "Sharjah, UAE",
    image: "/site/structural-works.png",
    status: "underConstruction" as const,
    contractor: "Emirates Construct",
    consultant: "BuildSight Consulting",
    targetHandover: "12 Mar 2027",
    progress: { planned: 22, actual: 24, delay: 0 },
  },
]

export const kpis = {
  openInspections: 12,
  pendingApprovals: 8,
  openNcrs: 5,
  safetyObservations: 3,
}

export const progressSeries = [
  { label: "Mar 17", planned: 22, actual: 18 },
  { label: "Mar 24", planned: 30, actual: 25 },
  { label: "Mar 31", planned: 38, actual: 33 },
  { label: "Apr 7", planned: 45, actual: 40 },
  { label: "Apr 14", planned: 52, actual: 46 },
  { label: "Apr 21", planned: 58, actual: 52 },
  { label: "Apr 28", planned: 63, actual: 57 },
  { label: "May 5", planned: 68, actual: 62 },
  { label: "May 12", planned: 72, actual: 68 },
]

export type PendingInspection = {
  id: string
  title: string
  discipline: Discipline
  dueDate: string
  overdue?: boolean
  priority: Priority
  status: InspectionStatus
}

export const pendingInspections: PendingInspection[] = [
  {
    id: "INSP-2025-046",
    title: "Rebar Inspection - Level 12",
    discipline: "Structural",
    dueDate: "16 May 2025",
    overdue: true,
    priority: "high",
    status: "pending",
  },
  {
    id: "INSP-2025-047",
    title: "MEP Rough-in - Level 10",
    discipline: "MEP",
    dueDate: "17 May 2025",
    overdue: true,
    priority: "high",
    status: "pending",
  },
  {
    id: "INSP-2025-048",
    title: "Blockwork - Level 8",
    discipline: "Architectural",
    dueDate: "19 May 2025",
    priority: "medium",
    status: "pending",
  },
  {
    id: "INSP-2025-049",
    title: "Waterproofing - Podium",
    discipline: "Civil",
    dueDate: "20 May 2025",
    priority: "medium",
    status: "pending",
  },
]

export const ncrStatus = {
  total: 27,
  open: 5,
  inReview: 3,
  closed: 19,
}

export type Activity = {
  id: string
  person: string
  initials: string
  action: string
  reference: string
  detail: string
  time: string
  tone: "info" | "danger" | "success" | "neutral"
}

export const recentActivity: Activity[] = [
  {
    id: "a1",
    person: "Ahmed Khalid",
    initials: "AK",
    action: "completed inspection",
    reference: "INSP-2025-045",
    detail: "Level 11 Slab Concreting",
    time: "1 hour ago",
    tone: "success",
  },
  {
    id: "a2",
    person: "Fatima Ali",
    initials: "FA",
    action: "raised NCR",
    reference: "NCR-2025-027",
    detail: "Honeycombing at Column C12",
    time: "3 hours ago",
    tone: "danger",
  },
  {
    id: "a3",
    person: "Mohammed Yusuf",
    initials: "MY",
    action: "submitted site report",
    reference: "SR-2025-087",
    detail: "Daily progress report",
    time: "5 hours ago",
    tone: "info",
  },
  {
    id: "a4",
    person: "Sara Al Mulla",
    initials: "SM",
    action: "approved material submittal",
    reference: "MS-2025-062",
    detail: "Structural steel grade 60",
    time: "1 day ago",
    tone: "success",
  },
]

export type SitePhoto = {
  id: string
  title: string
  image: string
  timestamp: string
}

export const sitePhotos: SitePhoto[] = [
  {
    id: "p1",
    title: "Level 12 - Structural Works",
    image: "/site/structural-works.png",
    timestamp: "15 May 2025, 09:15 AM",
  },
  {
    id: "p2",
    title: "Facade Installation",
    image: "/site/facade-installation.png",
    timestamp: "15 May 2025, 08:45 AM",
  },
  {
    id: "p3",
    title: "MEP Works - Level 10",
    image: "/site/mep-works.png",
    timestamp: "15 May 2025, 08:20 AM",
  },
]

export const notificationsCount = 3
